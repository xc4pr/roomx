import { describe, expect, it } from 'vitest';
import { decodeMessage, encodeMessage, openMessage, sealMessage } from './frames.ts';
import { open, seal } from './seal.ts';
import { deriveKeys, fromBase64Url, isToken, newToken, toBase64Url } from './token.ts';

const HASH = 'a'.repeat(64);

describe('token', () => {
	it('has 256 random bits in base64url', () => {
		const token = newToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(fromBase64Url(token)?.length).toBe(32);
		expect(isToken(token)).toBe(true);
		expect(newToken()).not.toBe(token);
	});

	it('rejects malformed tokens', () => {
		expect(isToken('')).toBe(false);
		expect(isToken('a'.repeat(42))).toBe(false);
		expect(isToken('a'.repeat(44))).toBe(false);
		expect(isToken('+'.repeat(43))).toBe(false);
	});

	it('round-trips base64url', () => {
		const bytes = Uint8Array.from({ length: 50 }, (_, i) => (i * 37) % 256);
		expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
		expect(fromBase64Url('a')).toBeNull();
		expect(fromBase64Url('ab$c')).toBeNull();
	});
});

describe('deriveKeys', () => {
	it('is deterministic per token and never contains the token', async () => {
		const token = newToken();
		const a = await deriveKeys(token);
		const b = await deriveKeys(token);
		expect(a.jobId).toBe(b.jobId);
		expect(a.topic).toBe(b.topic);
		expect(a.password).toBe(b.password);
		expect(a.mailbox).toBe(b.mailbox);
		expect(a.jobId).toMatch(/^[A-Za-z0-9_-]{12}$/);
		const values = [a.jobId, a.topic, a.password, a.mailbox];
		expect(new Set(values).size).toBe(4);
		for (const value of values) expect(value).not.toContain(token.slice(0, 8));
		expect(a.key.extractable).toBe(false);
	});

	it('gives different jobs different keys', async () => {
		const a = await deriveKeys(newToken());
		const b = await deriveKeys(newToken());
		expect(a.jobId).not.toBe(b.jobId);
		expect(a.topic).not.toBe(b.topic);
	});

	it('refuses invalid tokens', async () => {
		await expect(deriveKeys('nope')).rejects.toThrow();
	});
});

describe('seal', () => {
	it('round-trips with a fresh nonce', async () => {
		const { key } = await deriveKeys(newToken());
		const plain = new TextEncoder().encode('hallo');
		const first = await seal(key, plain, 'ctx');
		const second = await seal(key, plain, 'ctx');
		expect(first).not.toEqual(second);
		expect(await open(key, first, 'ctx')).toEqual(plain);
	});

	it('rejects a wrong key, a wrong context and tampering', async () => {
		const { key } = await deriveKeys(newToken());
		const { key: other } = await deriveKeys(newToken());
		const sealed = await seal(key, new Uint8Array([1, 2, 3]), 'ctx');
		expect(await open(other, sealed, 'ctx')).toBeNull();
		expect(await open(key, sealed, 'other')).toBeNull();
		const flipped = sealed.slice();
		flipped[flipped.length - 1] ^= 1;
		expect(await open(key, flipped, 'ctx')).toBeNull();
		expect(await open(key, new Uint8Array(10), 'ctx')).toBeNull();
	});
});

describe('frames', () => {
	const shot = {
		hash: HASH,
		room: 0,
		stepKey: 'corner:A',
		takenAt: '2026-10-15T20:00:00.000Z',
		size: 3
	};

	it('round-trips every frame type', () => {
		const messages = [
			{ frame: { t: 'hello' as const, pending: [shot] } },
			{ frame: { t: 'state' as const, received: [HASH] } },
			{ frame: { t: 'photo' as const, shot }, body: new Uint8Array([1, 2, 3]) },
			{ frame: { t: 'ack' as const, hash: HASH, ok: false, reason: 'invalid' as const } },
			{ frame: { t: 'revoked' as const } }
		];
		for (const message of messages) {
			expect(decodeMessage(encodeMessage(message))).toEqual(message);
		}
	});

	it('rejects unknown fields, wrong sizes and garbage', () => {
		const extra = encodeMessage({ frame: { t: 'revoked', x: 1 } as never });
		expect(decodeMessage(extra)).toBeNull();
		const short = encodeMessage({ frame: { t: 'photo', shot }, body: new Uint8Array([1, 2]) });
		expect(decodeMessage(short)).toBeNull();
		const trailing = encodeMessage({ frame: { t: 'revoked' }, body: new Uint8Array([1]) });
		expect(decodeMessage(trailing)).toBeNull();
		expect(decodeMessage(new Uint8Array([0, 0, 0, 200, 1]))).toBeNull();
		expect(decodeMessage(new Uint8Array([1]))).toBeNull();
		const badRoom = encodeMessage({ frame: { t: 'photo', shot: { ...shot, room: -1 } } });
		expect(decodeMessage(badRoom)).toBeNull();
	});

	it('only opens messages sealed for the same job', async () => {
		const keys = await deriveKeys(newToken());
		const other = await deriveKeys(newToken());
		const message = { frame: { t: 'state' as const, received: [] } };
		const sealed = await sealMessage(keys.key, keys.jobId, message);
		expect(await openMessage(keys.key, keys.jobId, sealed)).toEqual(message);
		expect(await openMessage(keys.key, other.jobId, sealed)).toBeNull();
		expect(await openMessage(other.key, keys.jobId, sealed)).toBeNull();
	});
});
