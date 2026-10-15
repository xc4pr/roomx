import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_NAME } from './channel.ts';
import { DB_NAME } from './db.ts';
import { lockName } from './tabs.ts';

const root = new URL('../../', import.meta.url).pathname;

function sources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return sources(path);
		return /\.(ts|svelte)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
	});
}

const files = sources(root).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

function collect(pattern: RegExp): { path: string; name: string }[] {
	return files.flatMap(({ path, text }) =>
		[...text.matchAll(pattern)].map((match) => ({ path, name: match[1] }))
	);
}

describe('names in the shared browser storage', () => {
	it('start with roomx for IndexedDB', () => {
		expect(DB_NAME).toMatch(/^roomx/);
		const databases = [
			...collect(/new Dexie\(\s*['"`]([^'"`]+)['"`]/g),
			...collect(/indexedDB\.open\(\s*['"`]([^'"`]+)['"`]/g)
		];
		for (const { name, path } of databases) expect(name, path).toMatch(/^roomx/);
	});

	it('start with roomx for every localStorage and sessionStorage key', () => {
		const storageFiles = files.filter(({ text }) => /localStorage|sessionStorage/.test(text));
		expect(storageFiles.length).toBeGreaterThan(2);
		const keys = storageFiles.flatMap(({ path, text }) =>
			[
				...text.matchAll(/(?:STORAGE_KEY|REMINDER_KEY|_KEY)\s*=\s*['"`]([^'"`]+)['"`]/g),
				...text.matchAll(/(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g)
			].map((match) => ({ path, name: match[1] }))
		);
		expect(keys.map(({ name }) => name)).toEqual(
			expect.arrayContaining(['roomx.settings', 'roomx.sync', 'roomx.reminder', 'roomx.panelWidth'])
		);
		for (const { name, path } of keys) expect(name, path).toMatch(/^roomx\./);
	});

	it('start with roomx for channels, locks and caches', () => {
		expect(CHANNEL_NAME).toMatch(/^roomx/);
		expect(lockName('abc')).toMatch(/^roomx\./);
		for (const { name, path } of collect(/new BroadcastChannel\(\s*['"`]([^'"`]+)['"`]/g)) {
			expect(name, path).toMatch(/^roomx/);
		}
		for (const { name, path } of collect(/const CACHE\s*=\s*[`'"]([^`'"]+)/g)) {
			expect(name, path).toMatch(/^roomx/);
		}
	});

	it('uses no other storage API', () => {
		const other = files.filter(
			({ path, text }) =>
				!path.includes('/service-worker/') && /\b(openDatabase|webkitStorageInfo)\b/.test(text)
		);
		expect(other).toEqual([]);
	});
});
