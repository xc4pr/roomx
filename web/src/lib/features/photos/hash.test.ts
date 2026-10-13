import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Fallback, sha256Hex } from './hash.ts';

const text = (value: string) => new TextEncoder().encode(value);

describe('hash', () => {
	it('encodes bytes as lowercase hex', () => {
		expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
		expect(bytesToHex(new Uint8Array([1, 2]).buffer)).toBe('0102');
	});

	it('matches known SHA-256 vectors in the fallback', () => {
		expect(bytesToHex(sha256Fallback(text('')))).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
		expect(bytesToHex(sha256Fallback(text('abc')))).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('agrees with node crypto for random sizes around block borders', async () => {
		for (const size of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 70000]) {
			const data = new Uint8Array(randomBytes(size));
			const expected = createHash('sha256').update(data).digest('hex');
			expect(bytesToHex(sha256Fallback(data))).toBe(expected);
			expect(await sha256Hex(data)).toBe(expected);
		}
	});
});
