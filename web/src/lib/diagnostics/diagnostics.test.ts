import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import { SCHEMA_VERSION } from '#lib/core/schema.ts';
import { db } from '#lib/state/db.ts';
import { countProjects } from './env.ts';
import { FEEDBACK_CHANNELS, feedbackChannels, isSafeFeedbackHref } from './feedback.ts';
import { cleanText, collectDiagnostics, formatDiagnostics, type DiagnosticsEnv } from './report.ts';

function environment(overrides: Partial<DiagnosticsEnv> = {}): DiagnosticsEnv {
	return {
		version: 'v1.2.3',
		buildDate: '2026-10-15',
		localOnly: true,
		schemaVersion: SCHEMA_VERSION,
		userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/605.1',
		platform: 'iPad',
		screenWidth: 1180,
		screenHeight: 820,
		windowWidth: 1180,
		windowHeight: 760,
		pixelRatio: 2,
		installed: () => true,
		storage: async () => ({ persisted: true, usage: 12_400_000, quota: 4_300_000_000 }),
		projectCount: async () => 3,
		webgl: () => ({ api: 'webgl2', renderer: 'Apple GPU', maxTextureSize: 16384 }),
		...overrides
	};
}

describe('collectDiagnostics', () => {
	it('reports version, build date, edition and the data schema', async () => {
		const report = await collectDiagnostics(environment());
		expect(report.version).toBe('v1.2.3');
		expect(report.buildDate).toBe('2026-10-15');
		expect(report.edition).toBe('public');
		expect(report.schemaVersion).toBe(SCHEMA_VERSION);
		expect((await collectDiagnostics(environment({ localOnly: false }))).edition).toBe('server');
	});

	it('reports device facts', async () => {
		const report = await collectDiagnostics(environment());
		expect(report.userAgent).toContain('iPad');
		expect(report.platform).toBe('iPad');
		expect(report.screen).toBe('1180x820 @2x, window 1180x760');
		expect(report.installed).toBe(true);
		expect(report.storage).toEqual({ persisted: true, usage: 12_400_000, quota: 4_300_000_000 });
		expect(report.webgl).toEqual({ api: 'webgl2', renderer: 'Apple GPU', maxTextureSize: 16384 });
	});

	it('uses unknown values instead of failing when the browser refuses', async () => {
		const report = await collectDiagnostics(
			environment({
				storage: async () => {
					throw new Error('denied');
				},
				projectCount: async () => {
					throw new Error('no database');
				},
				webgl: () => null,
				userAgent: '',
				version: ''
			})
		);
		expect(report.storage).toEqual({ persisted: null, usage: null, quota: null });
		expect(report.projectCount).toBeNull();
		expect(report.webgl).toBeNull();
		const text = formatDiagnostics(report);
		expect(text).toContain('Projects: unknown');
		expect(text).toContain('Persistent storage: unknown');
		expect(text).toContain('WebGL: unknown');
		expect(text).toContain('Version: unknown');
	});

	it('keeps every value on one line and short', async () => {
		const report = await collectDiagnostics(
			environment({ userAgent: `evil\nVersion: 99\r\n${'x'.repeat(1000)}` })
		);
		expect(report.userAgent).not.toMatch(/[\r\n]/);
		expect(report.userAgent.length).toBeLessThanOrEqual(300);
		expect(formatDiagnostics(report).split('\n')).toHaveLength(13);
		expect(cleanText(42)).toBe('');
	});

	it('drops nonsense numbers', async () => {
		const report = await collectDiagnostics(
			environment({
				storage: async () => ({ persisted: true, usage: Number.NaN, quota: -5 }),
				projectCount: async () => -1
			})
		);
		expect(report.storage.usage).toBeNull();
		expect(report.storage.quota).toBeNull();
		expect(report.projectCount).toBeNull();
	});
});

describe('formatDiagnostics', () => {
	it('prints a readable block for a bug report', async () => {
		const text = formatDiagnostics(await collectDiagnostics(environment()));
		expect(text.split('\n')).toEqual([
			'roomx diagnostics',
			'Version: v1.2.3',
			'Build date: 2026-10-15',
			'Edition: public (local only)',
			'Browser: Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/605.1',
			'Platform: iPad',
			'Screen: 1180x820 @2x, window 1180x760',
			'Installed as app: yes',
			'Persistent storage: yes',
			'Storage used: 12.4 MB of 4300.0 MB',
			`Data schema version: ${SCHEMA_VERSION}`,
			'Projects: 3',
			'WebGL: webgl2, Apple GPU, max texture 16384'
		]);
	});

	it('names the own server edition', async () => {
		const text = formatDiagnostics(await collectDiagnostics(environment({ localOnly: false })));
		expect(text).toContain('Edition: own server');
	});

	it('says when WebGL is missing', async () => {
		const text = formatDiagnostics(
			await collectDiagnostics(
				environment({ webgl: () => ({ api: 'none', renderer: null, maxTextureSize: null }) })
			)
		);
		expect(text).toContain('WebGL: not available');
	});
});

describe('privacy', () => {
	it('contains no project data, names or photos', async () => {
		await db.delete();
		await db.open();
		const secret = {
			...sampleProject(),
			id: 'geheim-id-4711',
			name: 'Geheimes Haus Musterstrasse 12',
			rooms: sampleProject().rooms.map((room) => ({
				...room,
				name: 'Schlafzimmer von Erika',
				notes: 'Tresor hinter dem Bild'
			}))
		};
		await db.projects.put(secret);
		await db.projects.put({ ...secret, id: 'zweites', name: 'Zweites Projekt' });
		await db.projects.put({ ...secret, id: 'geloescht', name: 'Weg', deleted: true });
		await db.photos.put({
			hash: 'abc123hash',
			blob: new Blob(['photo-bytes']),
			thumbnail: new Blob(['thumb']),
			w: 10,
			h: 10,
			uploaded: false
		});

		const report = await collectDiagnostics(environment({ projectCount: countProjects }));
		const text = formatDiagnostics(report);
		const json = JSON.stringify(report);

		expect(report.projectCount).toBe(2);
		expect(text).toContain('Projects: 2');
		for (const secretText of [
			'Geheim',
			'Musterstrasse',
			'Erika',
			'Tresor',
			'geheim-id',
			'zweites',
			'Zweites',
			'abc123hash',
			'photo'
		]) {
			expect(text.includes(secretText), `text: ${secretText}`).toBe(false);
			expect(json.includes(secretText), `json: ${secretText}`).toBe(false);
		}
	});

	it('only exposes the documented fields', async () => {
		const report = await collectDiagnostics(environment());
		expect(Object.keys(report).sort()).toEqual([
			'buildDate',
			'edition',
			'installed',
			'platform',
			'projectCount',
			'schemaVersion',
			'screen',
			'storage',
			'userAgent',
			'version',
			'webgl'
		]);
		expect(typeof report.projectCount).toBe('number');
	});
});

describe('feedback channels', () => {
	it('offers the issue form of the public repository', () => {
		expect(feedbackChannels().map((channel) => channel.kind)).toContain('issues');
		expect(feedbackChannels()[0]?.href).toBe('https://github.com/xc4pr/roomx/issues/new/choose');
	});

	it('only uses safe links', () => {
		for (const channel of FEEDBACK_CHANNELS) expect(isSafeFeedbackHref(channel.href)).toBe(true);
		expect(isSafeFeedbackHref('https://example.org/x')).toBe(true);
		expect(isSafeFeedbackHref('mailto:hallo@example.org')).toBe(true);
		expect(isSafeFeedbackHref('javascript:alert(1)')).toBe(false);
		expect(isSafeFeedbackHref('data:text/html,hi')).toBe(false);
		expect(isSafeFeedbackHref('http://example.org')).toBe(false);
		expect(isSafeFeedbackHref('not a url')).toBe(false);
	});
});
