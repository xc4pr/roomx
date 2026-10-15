import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { cspDirectives } from './src/lib/security/csp.ts';

function basePath(value: string | undefined): '' | `/${string}` {
	if (!value) return '';
	if (!value.startsWith('/')) throw new Error(`BASE_PATH must start with "/": ${value}`);
	return value as `/${string}`;
}

export default defineConfig({
	define: {
		__ROOMX_LOCAL_ONLY__: JSON.stringify(process.env.LOCAL_ONLY === '1'),
		__ROOMX_VERSION__: JSON.stringify(process.env.ROOMX_VERSION ?? 'dev'),
		__ROOMX_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10))
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
					localOnly: process.env.LOCAL_ONLY === '1',
					connectSrc: process.env.ROOMX_CONNECT_SRC
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
