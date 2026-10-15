import { describe, expect, it } from 'vitest';
import { FakeServer } from './fakeServer.ts';
import { normalizeServerUrl, parseHealth, testConnection } from './connection.ts';

describe('normalizeServerUrl', () => {
	it('returns null for empty or broken input', () => {
		expect(normalizeServerUrl('')).toBeNull();
		expect(normalizeServerUrl('  ')).toBeNull();
		expect(normalizeServerUrl('http://')).toBeNull();
	});

	it('strips trailing slashes and keeps the path', () => {
		expect(normalizeServerUrl('https://a.example/')).toBe('https://a.example');
		expect(normalizeServerUrl('https://a.example/roomx///')).toBe('https://a.example/roomx');
	});

	it('adds http for local addresses and https otherwise', () => {
		expect(normalizeServerUrl('192.168.1.20:8000')).toBe('http://192.168.1.20:8000');
		expect(normalizeServerUrl('localhost:8000')).toBe('http://localhost:8000');
		expect(normalizeServerUrl('nas.local')).toBe('http://nas.local');
		expect(normalizeServerUrl('roomx.example.ch')).toBe('https://roomx.example.ch');
	});
});

describe('parseHealth', () => {
	it('accepts only the expected shape', () => {
		expect(parseHealth({ status: 'ok', version: '1' })).toEqual({ version: '1' });
		expect(parseHealth({ status: 'ok' })).toBeNull();
		expect(parseHealth({ status: 'bad', version: '1' })).toBeNull();
		expect(parseHealth(null)).toBeNull();
		expect(parseHealth('ok')).toBeNull();
	});
});

describe('testConnection', () => {
	const url = 'https://s.example';

	it('reports success with the project count', async () => {
		const server = new FakeServer();
		server.seed({ id: 'a', name: 'A', updatedAt: '' });
		expect(await testConnection(url, 'token', server.fetch, null)).toEqual({
			kind: 'ok',
			version: 'test',
			projects: 1
		});
	});

	it('distinguishes the failure modes', async () => {
		const server = new FakeServer();
		expect(await testConnection(url, 'wrong', server.fetch, null)).toEqual({
			kind: 'unauthorized'
		});
		expect(await testConnection(url, '', server.fetch, null)).toEqual({ kind: 'noToken' });
		expect(await testConnection('http://', 'token', server.fetch, null)).toEqual({
			kind: 'invalidUrl'
		});
		expect(await testConnection('', 'token', server.fetch, null)).toEqual({
			kind: 'invalidUrl'
		});
		server.offline = true;
		expect(await testConnection(url, 'token', server.fetch, null)).toEqual({
			kind: 'unreachable'
		});
		const html = async () => new Response('<html></html>', { status: 200 });
		expect(await testConnection(url, 'token', html, null)).toEqual({ kind: 'notServer' });
	});

	it('uses the own origin when the address is empty', async () => {
		const server = new FakeServer();
		const result = await testConnection('', 'token', server.fetch, 'https://own.example');
		expect(result.kind).toBe('ok');
		expect(server.log[0]).toBe('GET /api/health');
	});
});
