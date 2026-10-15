import { z } from 'zod';
import { open, seal } from './seal.ts';
import { MAX_ROOMS_PER_JOB, MAX_SHOT_BYTES, MAX_SHOTS_PER_JOB } from './types.ts';

const MAX_HEADER_BYTES = 128 * 1024;
const HASH = z.string().regex(/^[0-9a-f]{64}$/);

const ShotInfoSchema = z.strictObject({
	hash: HASH,
	room: z
		.number()
		.int()
		.min(0)
		.max(MAX_ROOMS_PER_JOB - 1),
	stepKey: z.string().min(1).max(200),
	takenAt: z.string().min(1).max(64),
	size: z.number().int().positive().max(MAX_SHOT_BYTES)
});

const FrameSchema = z.discriminatedUnion('t', [
	z.strictObject({
		t: z.literal('hello'),
		pending: z.array(ShotInfoSchema).max(MAX_SHOTS_PER_JOB)
	}),
	z.strictObject({ t: z.literal('state'), received: z.array(HASH).max(MAX_SHOTS_PER_JOB) }),
	z.strictObject({ t: z.literal('photo'), shot: ShotInfoSchema }),
	z.strictObject({
		t: z.literal('ack'),
		hash: HASH,
		ok: z.boolean(),
		duplicate: z.boolean().optional(),
		reason: z.enum(['invalid', 'limit', 'storage', 'readOnly', 'unknownRoom']).optional()
	}),
	z.strictObject({ t: z.literal('revoked') })
]);

export type Frame = z.infer<typeof FrameSchema>;

export interface Message {
	frame: Frame;
	// JPEG bytes, only for `photo`.
	body?: Uint8Array<ArrayBuffer>;
}

export function encodeMessage({ frame, body }: Message): Uint8Array<ArrayBuffer> {
	const header = new TextEncoder().encode(JSON.stringify(frame));
	const payload = body ?? new Uint8Array();
	const out = new Uint8Array(4 + header.byteLength + payload.byteLength);
	new DataView(out.buffer).setUint32(0, header.byteLength);
	out.set(header, 4);
	out.set(payload, 4 + header.byteLength);
	return out;
}

export function decodeMessage(bytes: Uint8Array<ArrayBuffer>): Message | null {
	if (bytes.byteLength < 4) return null;
	const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
	if (length > MAX_HEADER_BYTES || 4 + length > bytes.byteLength) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(
			new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + length))
		);
	} catch {
		return null;
	}
	const result = FrameSchema.safeParse(parsed);
	if (!result.success) return null;
	const frame = result.data;
	const body = bytes.subarray(4 + length);
	if (frame.t === 'photo') {
		if (body.byteLength !== frame.shot.size || body.byteLength > MAX_SHOT_BYTES) return null;
		return { frame, body };
	}
	return body.byteLength === 0 ? { frame } : null;
}

// Every message on the wire is encrypted with the job key; the job id binds it to this job.
export async function sealMessage(
	key: CryptoKey,
	jobId: string,
	message: Message
): Promise<Uint8Array<ArrayBuffer>> {
	return seal(key, encodeMessage(message), `roomx-mirror:${jobId}`);
}

export async function openMessage(
	key: CryptoKey,
	jobId: string,
	sealed: Uint8Array<ArrayBuffer>
): Promise<Message | null> {
	if (sealed.byteLength > MAX_SHOT_BYTES + MAX_HEADER_BYTES + 64) return null;
	const plain = await open(key, sealed, `roomx-mirror:${jobId}`);
	return plain ? decodeMessage(plain) : null;
}
