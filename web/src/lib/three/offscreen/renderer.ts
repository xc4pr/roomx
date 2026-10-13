import { WebGLRenderer } from 'three';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const IDLE_MS = 4000;

let shared: WebGLRenderer | null = null;
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function createCanvas(width: number, height: number): AnyCanvas {
	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}
	return new OffscreenCanvas(width, height);
}

function acquire(): WebGLRenderer {
	if (shared && shared.getContext().isContextLost()) release();
	if (!shared) {
		shared = new WebGLRenderer({
			canvas: createCanvas(2, 2),
			antialias: true,
			alpha: true,
			powerPreference: 'low-power'
		});
		shared.setPixelRatio(1);
		shared.shadowMap.enabled = true;
	}
	return shared;
}

function release(): void {
	if (!shared) return;
	shared.dispose();
	shared.forceContextLoss();
	shared = null;
}

export function withRenderer<T>(task: (renderer: WebGLRenderer) => T | Promise<T>): Promise<T> {
	pending++;
	if (timer) clearTimeout(timer);
	const run = chain.then(() => task(acquire()));
	chain = run
		.catch(() => undefined)
		.then(() => {
			pending--;
			if (pending === 0) timer = setTimeout(release, IDLE_MS);
		});
	return run;
}

export function drawToBlob(
	renderer: WebGLRenderer,
	width: number,
	height: number,
	background?: string
): Promise<Blob> {
	const out = createCanvas(width, height);
	const context = out.getContext('2d') as
		CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	if (background) {
		context.fillStyle = background;
		context.fillRect(0, 0, width, height);
	}
	context.drawImage(renderer.domElement, 0, 0);
	return canvasToBlob(out);
}

export function plainBlob(width: number, height: number, background: string): Promise<Blob> {
	const out = createCanvas(width, height);
	const context = out.getContext('2d') as
		CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	context.fillStyle = background;
	context.fillRect(0, 0, width, height);
	return canvasToBlob(out);
}

function canvasToBlob(canvas: AnyCanvas): Promise<Blob> {
	if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png');
	});
}

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
