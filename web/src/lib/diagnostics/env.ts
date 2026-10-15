import { SCHEMA_VERSION } from '#lib/core/schema.ts';
import { BUILD_DATE, IS_FREE, VERSION } from '#lib/edition.ts';
import { listProjects } from '#lib/state/persistence.ts';
import type { DiagnosticsEnv, StorageSnapshot, WebglSnapshot } from './report.ts';

export async function readStorageSnapshot(): Promise<StorageSnapshot> {
	const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
	if (!storage) return { persisted: null, usage: null, quota: null };
	let persisted: boolean | null = null;
	try {
		persisted = (await storage.persisted?.()) ?? null;
	} catch {
		persisted = null;
	}
	try {
		const estimate = await storage.estimate?.();
		return { persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
	} catch {
		return { persisted, usage: null, quota: null };
	}
}

export async function countProjects(): Promise<number> {
	return (await listProjects()).length;
}

export function readWebgl(): WebglSnapshot | null {
	try {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
		if (!gl) return { api: 'none', renderer: null, maxTextureSize: null };
		const debug = gl.getExtension('WEBGL_debug_renderer_info');
		const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
		const snapshot: WebglSnapshot = {
			api:
				typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
					? 'webgl2'
					: 'webgl',
			renderer: typeof renderer === 'string' ? renderer : null,
			maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || null
		};
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return snapshot;
	} catch {
		return null;
	}
}

function installed(): boolean {
	const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
	return standalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function browserEnv(): DiagnosticsEnv {
	return {
		version: VERSION,
		buildDate: BUILD_DATE,
		serverSync: !IS_FREE,
		schemaVersion: SCHEMA_VERSION,
		userAgent: navigator.userAgent,
		platform: navigator.platform,
		screenWidth: screen.width,
		screenHeight: screen.height,
		windowWidth: window.innerWidth,
		windowHeight: window.innerHeight,
		pixelRatio: window.devicePixelRatio || 1,
		installed,
		storage: readStorageSnapshot,
		projectCount: countProjects,
		webgl: readWebgl
	};
}
