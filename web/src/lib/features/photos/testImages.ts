function bytes(...parts: (number | number[] | string)[]): Uint8Array {
	const out: number[] = [];
	for (const part of parts) {
		if (typeof part === 'number') out.push(part);
		else if (typeof part === 'string') for (const char of part) out.push(char.charCodeAt(0));
		else out.push(...part);
	}
	return new Uint8Array(out);
}

export function minimalJpeg(w = 64, h = 48, trailer = ''): Uint8Array {
	return bytes(
		[0xff, 0xd8],
		[0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00],
		[0x01, 0x00, 0x00],
		[0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03],
		[0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01],
		[0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00],
		[0x12, 0x34, 0x56, 0x78],
		[0xff, 0xd9],
		trailer
	);
}

export function minimalWebp(w = 64, h = 48): Uint8Array {
	const size = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
	return bytes(
		'RIFF',
		[22, 0, 0, 0],
		'WEBPVP8X',
		[10, 0, 0, 0],
		[0, 0, 0, 0],
		size(w - 1),
		size(h - 1),
		[0, 0]
	);
}

export function svgImage(): Uint8Array {
	return bytes(
		'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'
	);
}
