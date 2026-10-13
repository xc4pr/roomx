import { Color, SRGBColorSpace } from 'three';

export function readCssColor(element: Element, name: string, fallback: string): Color {
	try {
		const raw = getComputedStyle(element).getPropertyValue(name).trim();
		if (!raw) return new Color(fallback);
		if (/^#[0-9a-f]{3,8}$/i.test(raw)) return new Color(raw);
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return new Color(fallback);
		context.fillStyle = '#000';
		context.fillStyle = raw;
		context.fillRect(0, 0, 1, 1);
		const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
		return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
	} catch {
		return new Color(fallback);
	}
}
