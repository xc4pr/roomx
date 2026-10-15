import { describe, expect, it } from 'vitest';
import {
	collectLicenses,
	groupByLicense,
	isFont,
	MAX_TEXT_LENGTH,
	parseLicenses,
	selectPackages,
	type PnpmListing,
	type PnpmPackage
} from './licenseData.ts';

function entry(name: string, license: string, extra: Partial<PnpmPackage> = {}): PnpmPackage {
	return { name, versions: ['1.0.0'], paths: [`/pkg/${name}`], license, ...extra };
}

const production: PnpmListing = {
	MIT: [entry('zod', 'MIT'), entry('svelte', 'MIT')],
	'OFL-1.1': [entry('@fontsource/figtree', 'OFL-1.1')]
};
const everything: PnpmListing = {
	MIT: [...production.MIT!, entry('@sveltejs/kit', 'MIT'), entry('vite', 'MIT')]
};

describe('selectPackages', () => {
	it('takes the production packages and the runtime extras, sorted by name', () => {
		const names = selectPackages(production, everything).map((candidate) => candidate.name);
		expect(names).toEqual(['@fontsource/figtree', '@sveltejs/kit', 'svelte', 'zod']);
	});

	it('leaves out development tools', () => {
		const names = selectPackages(production, everything).map((candidate) => candidate.name);
		expect(names).not.toContain('vite');
	});
});

describe('collectLicenses', () => {
	it('reads the text, merges versions and flags fonts', () => {
		const data = collectLicenses(
			[
				entry('tslib', '0BSD', { versions: ['1.14.1', '2.8.1', '2.8.1'], author: 'MS' }),
				entry('@fontsource/figtree', 'OFL-1.1')
			],
			(paths) => `text of ${paths[0]}`,
			'2026-10-15'
		);
		expect(data.generated).toBe('2026-10-15');
		expect(data.packages[0]).toMatchObject({
			name: 'tslib',
			version: '1.14.1, 2.8.1',
			author: 'MS',
			font: false,
			text: 'text of /pkg/tslib'
		});
		expect(data.packages[1]).toMatchObject({ font: true });
		expect('homepage' in data.packages[0]!).toBe(false);
	});

	it('caps very long licence texts', () => {
		const data = collectLicenses(
			[entry('big', 'MIT')],
			() => 'x'.repeat(MAX_TEXT_LENGTH + 500),
			'2026-10-15'
		);
		expect(data.packages[0]!.text).toHaveLength(MAX_TEXT_LENGTH);
	});
});

describe('groupByLicense', () => {
	it('puts the most common licence first', () => {
		const data = collectLicenses(selectPackages(production, everything), () => '', '2026-10-15');
		const groups = groupByLicense(data.packages);
		expect(groups.map((group) => [group.license, group.packages.length])).toEqual([
			['MIT', 3],
			['OFL-1.1', 1]
		]);
	});
});

describe('parseLicenses', () => {
	it('accepts generated data and rejects anything else', () => {
		const data = collectLicenses([entry('zod', 'MIT')], () => 'MIT text', '2026-10-15');
		expect(parseLicenses(JSON.parse(JSON.stringify(data)))).toEqual(data);
		expect(parseLicenses(null)).toBeNull();
		expect(parseLicenses({ generated: '2026-10-15', packages: [] })).toBeNull();
		expect(parseLicenses({ generated: '2026-10-15', packages: [{ name: 1 }] })).toBeNull();
	});
});

describe('helpers', () => {
	it('recognises the font packages', () => {
		expect(isFont('@fontsource/figtree')).toBe(true);
		expect(isFont('@fontsource-variable/figtree')).toBe(true);
		expect(isFont('three')).toBe(false);
	});
});
