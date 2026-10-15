export interface StorageSnapshot {
	persisted: boolean | null;
	usage: number | null;
	quota: number | null;
}

export interface WebglSnapshot {
	api: 'webgl2' | 'webgl' | 'none';
	renderer: string | null;
	maxTextureSize: number | null;
}

export interface DiagnosticsEnv {
	version: string;
	buildDate: string;
	serverSync: boolean;
	schemaVersion: number;
	userAgent: string;
	platform: string;
	screenWidth: number;
	screenHeight: number;
	windowWidth: number;
	windowHeight: number;
	pixelRatio: number;
	installed(): boolean;
	storage(): Promise<StorageSnapshot>;
	projectCount(): Promise<number | null>;
	webgl(): WebglSnapshot | null;
}

export interface DiagnosticsReport {
	version: string;
	buildDate: string;
	edition: 'public' | 'server';
	userAgent: string;
	platform: string;
	screen: string;
	installed: boolean;
	storage: StorageSnapshot;
	schemaVersion: number;
	projectCount: number | null;
	webgl: WebglSnapshot | null;
}

const MAX_TEXT = 300;
const MEGABYTE = 1_000_000;

export function cleanText(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function count(value: number | null): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function size(width: number, height: number): string {
	return `${Math.round(width)}x${Math.round(height)}`;
}

async function storageOf(env: DiagnosticsEnv): Promise<StorageSnapshot> {
	try {
		const stored = await env.storage();
		return {
			persisted: typeof stored.persisted === 'boolean' ? stored.persisted : null,
			usage: count(stored.usage),
			quota: count(stored.quota)
		};
	} catch {
		return { persisted: null, usage: null, quota: null };
	}
}

async function projectsOf(env: DiagnosticsEnv): Promise<number | null> {
	try {
		return count(await env.projectCount());
	} catch {
		return null;
	}
}

export async function collectDiagnostics(env: DiagnosticsEnv): Promise<DiagnosticsReport> {
	const [storage, projectCount] = await Promise.all([storageOf(env), projectsOf(env)]);
	const webgl = env.webgl();
	return {
		version: cleanText(env.version) || 'unknown',
		buildDate: cleanText(env.buildDate) || 'unknown',
		edition: env.serverSync ? 'server' : 'public',
		userAgent: cleanText(env.userAgent) || 'unknown',
		platform: cleanText(env.platform) || 'unknown',
		screen: `${size(env.screenWidth, env.screenHeight)} @${Math.round(env.pixelRatio * 100) / 100}x, window ${size(env.windowWidth, env.windowHeight)}`,
		installed: env.installed(),
		storage,
		schemaVersion: env.schemaVersion,
		projectCount,
		webgl: webgl
			? {
					api: webgl.api,
					renderer: cleanText(webgl.renderer) || null,
					maxTextureSize: count(webgl.maxTextureSize)
				}
			: null
	};
}

function yesNo(value: boolean | null): string {
	return value === null ? 'unknown' : value ? 'yes' : 'no';
}

function megabytes(value: number | null): string {
	return value === null ? 'unknown' : `${(value / MEGABYTE).toFixed(1)} MB`;
}

function webglLine(webgl: WebglSnapshot | null): string {
	if (!webgl) return 'unknown';
	if (webgl.api === 'none') return 'not available';
	const parts: string[] = [webgl.api];
	if (webgl.renderer) parts.push(webgl.renderer);
	if (webgl.maxTextureSize !== null) parts.push(`max texture ${webgl.maxTextureSize}`);
	return parts.join(', ');
}

export function formatDiagnostics(report: DiagnosticsReport): string {
	return [
		'RoomX diagnostics',
		`Version: ${report.version}`,
		`Build date: ${report.buildDate}`,
		`Edition: ${report.edition === 'public' ? 'public (local only)' : 'own server'}`,
		`Browser: ${report.userAgent}`,
		`Platform: ${report.platform}`,
		`Screen: ${report.screen}`,
		`Installed as app: ${yesNo(report.installed)}`,
		`Persistent storage: ${yesNo(report.storage.persisted)}`,
		`Storage used: ${megabytes(report.storage.usage)} of ${megabytes(report.storage.quota)}`,
		`Data schema version: ${report.schemaVersion}`,
		`Projects: ${report.projectCount ?? 'unknown'}`,
		`WebGL: ${webglLine(report.webgl)}`
	].join('\n');
}
