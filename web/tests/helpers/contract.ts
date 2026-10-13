import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let cached:
	{ exportSchema: Record<string, unknown>; planSchema: Record<string, unknown> } | undefined;

export function contract() {
	if (cached) return cached;
	const target = mkdtempSync(join(tmpdir(), 'roomx-contract-'));
	execFileSync(process.execPath, ['scripts/emit-contract.ts', target], {
		cwd: resolve(import.meta.dirname, '..', '..'),
		stdio: 'ignore'
	});
	cached = {
		exportSchema: JSON.parse(readFileSync(join(target, 'export.schema.json'), 'utf8')),
		planSchema: JSON.parse(readFileSync(join(target, 'plan.schema.json'), 'utf8'))
	};
	return cached;
}
