import type { ShotTag } from './types.ts';

// `roomx_<job>_<room>_<step>.jpg`, step key with `:` replaced so the name is valid on every system.
export function shotFileName(tag: ShotTag): string {
	void tag;
	throw new Error('not implemented');
}

// Inserts a JPEG comment segment (COM) with the assignment right after SOI.
export function withShotComment(
	jpeg: Uint8Array<ArrayBuffer>,
	tag: ShotTag
): Uint8Array<ArrayBuffer> {
	void jpeg;
	void tag;
	throw new Error('not implemented');
}

// Assignment from the JPEG comment, else from the file name; null when neither is usable.
export function readShotTag(fileName: string, jpeg: Uint8Array<ArrayBuffer>): ShotTag | null {
	void fileName;
	void jpeg;
	throw new Error('not implemented');
}
