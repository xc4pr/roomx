import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	collectLicenses,
	selectPackages,
	type PnpmListing
} from '../src/lib/features/legal/licenseData.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src/lib/features/legal/licenses.generated.json');
const FILE_NAME = /^(licen[sc]e|copying)(\.(md|txt|markdown))?$/i;

function list(...flags: string[]): PnpmListing {
	const output = execFileSync('pnpm', ['licenses', 'list', ...flags, '--json'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	return JSON.parse(output) as PnpmListing;
}

function readText(paths: readonly string[]): string {
	for (const path of paths) {
		const file = readdirSync(path).find((name) => FILE_NAME.test(name));
		if (file) return readFileSync(join(path, file), 'utf8').replace(/\r\n/g, '\n').trim();
	}
	return '';
}

const packages = selectPackages(list('--prod'), list());
const data = collectLicenses(packages, readText, new Date().toISOString().slice(0, 10));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(data, null, '\t')}\n`);
console.log(`licenses: ${data.packages.length} packages`);
