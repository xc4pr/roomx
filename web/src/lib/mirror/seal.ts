const NONCE_BYTES = 12;

// AES-256-GCM with a fresh random nonce per message; output = nonce || ciphertext+tag.
export async function seal(
	key: CryptoKey,
	plain: Uint8Array<ArrayBuffer>,
	aad: string
): Promise<Uint8Array<ArrayBuffer>> {
	const nonce = new Uint8Array(NONCE_BYTES);
	crypto.getRandomValues(nonce);
	const cipher = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(aad) },
		key,
		plain
	);
	const out = new Uint8Array(NONCE_BYTES + cipher.byteLength);
	out.set(nonce);
	out.set(new Uint8Array(cipher), NONCE_BYTES);
	return out;
}

// Returns null for anything that does not decrypt with this key and context.
export async function open(
	key: CryptoKey,
	sealed: Uint8Array<ArrayBuffer>,
	aad: string
): Promise<Uint8Array<ArrayBuffer> | null> {
	if (sealed.byteLength < NONCE_BYTES + 16) return null;
	try {
		const plain = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: sealed.subarray(0, NONCE_BYTES),
				additionalData: new TextEncoder().encode(aad)
			},
			key,
			sealed.subarray(NONCE_BYTES)
		);
		return new Uint8Array(plain);
	} catch {
		return null;
	}
}
