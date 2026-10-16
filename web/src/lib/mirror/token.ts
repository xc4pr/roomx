const TOKEN_BYTES = 32;
const SALT = new TextEncoder().encode('roomx-mirror-v1');
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface MirrorKeys {
	// Public identifiers: safe in file names, storage keys and messages.
	jobId: string;
	// Secrets derived from the token; the token itself never leaves the devices.
	topic: string;
	password: string;
	mailbox: string;
	key: CryptoKey;
	// Signs placement receipts, so only a holder of the token can make the phone delete a photo.
	receipt: CryptoKey;
}

export function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
	const padded =
		text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
	try {
		const binary = atob(padded);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

export function newToken(): string {
	const bytes = new Uint8Array(TOKEN_BYTES);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes);
}

export function isToken(value: string): boolean {
	return TOKEN_PATTERN.test(value) && fromBase64Url(value)?.length === TOKEN_BYTES;
}

export function hasWebCrypto(): boolean {
	return typeof globalThis.crypto?.subtle?.importKey === 'function';
}

async function derive(base: CryptoKey, label: string, bytes: number): Promise<Uint8Array> {
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode(label) },
		base,
		bytes * 8
	);
	return new Uint8Array(bits);
}

export async function deriveKeys(token: string): Promise<MirrorKeys> {
	const raw = isToken(token) ? fromBase64Url(token) : null;
	if (!raw) throw new Error('invalid token');
	const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, [
		'deriveBits',
		'deriveKey'
	]);
	const key = await crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode('aes') },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
	const receipt = await crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode('receipt') },
		base,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		['sign']
	);
	const [jobId, topic, password, mailbox] = await Promise.all([
		derive(base, 'job', 9),
		derive(base, 'topic', 24),
		derive(base, 'sdp', 32),
		derive(base, 'mailbox', 32)
	]);
	return {
		jobId: toBase64Url(jobId),
		topic: toBase64Url(topic),
		password: toBase64Url(password),
		mailbox: toBase64Url(mailbox),
		key,
		receipt
	};
}

// Lowercase hex HMAC of one mailbox photo, bound to its job.
export async function receiptFor(
	keys: Pick<MirrorKeys, 'receipt'>,
	jobId: string,
	id: string
): Promise<string> {
	const mac = await crypto.subtle.sign(
		'HMAC',
		keys.receipt,
		new TextEncoder().encode(`${jobId}:${id}`)
	);
	return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
