import { MAX_ROOMS_PER_JOB, type ShotTag } from './types.ts';

const MARKER = 'roomx-shot';
const JOB_ID = '[A-Za-z0-9_-]{12}';
const STEP = '[A-Za-z0-9]+(?::[A-Za-z0-9]+)*';
const COMMENT = new RegExp(`^${MARKER}:1:(${JOB_ID}):(\\d{1,3}):(${STEP})$`);
const NAME = new RegExp(
	`^roomx_(${JOB_ID})_(\\d{1,3})_([A-Za-z0-9~]+)(?:\\s*\\(\\d+\\)|-\\d+|\\s+-\\s+copy|\\s+copy)*$`,
	'i'
);

export function shotFileName(tag: ShotTag): string {
	return `roomx_${tag.jobId}_${tag.room}_${tag.stepKey.replace(/:/g, '~')}.jpg`;
}

export function withShotComment(
	jpeg: Uint8Array<ArrayBuffer>,
	tag: ShotTag
): Uint8Array<ArrayBuffer> {
	if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg.slice();
	const text = new TextEncoder().encode(`${MARKER}:1:${tag.jobId}:${tag.room}:${tag.stepKey}`);
	const length = text.length + 2;
	const out = new Uint8Array(jpeg.length + 2 + length);
	out.set(jpeg.subarray(0, 2), 0);
	out[2] = 0xff;
	out[3] = 0xfe;
	out[4] = length >> 8;
	out[5] = length & 0xff;
	out.set(text, 6);
	out.set(jpeg.subarray(2), 6 + text.length);
	return out;
}

function readComments(jpeg: Uint8Array): string[] {
	const comments: string[] = [];
	if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return comments;
	let at = 2;
	while (at + 4 <= jpeg.length) {
		if (jpeg[at] !== 0xff) break;
		const marker = jpeg[at + 1];
		if (marker === 0xff) {
			at++;
			continue;
		}
		if (marker === 0xda || marker === 0xd9) break;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			at += 2;
			continue;
		}
		const length = (jpeg[at + 2] << 8) | jpeg[at + 3];
		const end = at + 2 + length;
		if (length < 2 || end > jpeg.length) break;
		if (marker === 0xfe) {
			comments.push(new TextDecoder('utf-8').decode(jpeg.subarray(at + 4, end)));
		}
		at = end;
	}
	return comments;
}

function valid(tag: ShotTag): ShotTag | null {
	return tag.room >= 0 && tag.room < MAX_ROOMS_PER_JOB ? tag : null;
}

export function readShotTag(fileName: string, jpeg: Uint8Array<ArrayBuffer>): ShotTag | null {
	for (const comment of readComments(jpeg)) {
		const match = COMMENT.exec(comment);
		if (!match) continue;
		const tag = valid({ jobId: match[1], room: Number(match[2]), stepKey: match[3] });
		if (tag) return tag;
	}
	const base = fileName.split(/[\\/]/).pop() ?? '';
	const name = base.replace(/\.(jpe?g)$/i, '');
	const match = NAME.exec(name);
	if (!match) return null;
	return valid({
		jobId: match[1],
		room: Number(match[2]),
		stepKey: match[3].replace(/~/g, ':')
	});
}
