import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolveEdition } from './src/lib/editionConfig.ts';
import { cspDirectives } from './src/lib/security/csp.ts';
import { resolveMirrorNetwork } from './src/lib/mirror/config.ts';

function basePath(value: string | undefined): '' | `/${string}` {
	if (!value) return '';
	if (!value.startsWith('/')) throw new Error(`BASE_PATH must start with "/": ${value}`);
	return value as `/${string}`;
}

const EDITION = resolveEdition(process.env);
const MIRROR = resolveMirrorNetwork(process.env);

export default defineConfig({
	define: {
		__ROOMX_EDITION__: JSON.stringify(EDITION),
		__ROOMX_VERSION__: JSON.stringify(process.env.ROOMX_VERSION ?? 'dev'),
		__ROOMX_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
		__ROOMX_MIRROR_RELAYS__: JSON.stringify(MIRROR.relays),
		__ROOMX_MIRROR_STUN__: JSON.stringify(MIRROR.stun)
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' }),
			paths: { base: basePath(process.env.BASE_PATH), relative: false },
			csp: {
				mode: 'hash',
				directives: cspDirectives({
					localOnly: EDITION === 'free',
					connectSrc: process.env.ROOMX_CONNECT_SRC,
					mirrorRelays: MIRROR.relays
				})
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
