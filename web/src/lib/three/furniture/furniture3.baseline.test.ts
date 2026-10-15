import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import baseline from './furniture3-baseline.json';
import { STAGE3_MODELS, stage3Dims } from './furniture3.baseline.ts';
import { build, stats } from './snapshot.helper.ts';

if (process.env.UPDATE_BASELINE) {
	const out: Record<string, unknown> = {};
	for (const model of STAGE3_MODELS) {
		stage3Dims(model).forEach((dims, i) => (out[`${model}#${i}`] = stats(build(model, dims))));
	}
	writeFileSync(
		new URL('./furniture3-baseline.json', import.meta.url),
		JSON.stringify(out, null, '\t') + '\n'
	);
}

describe('stage 3 builders without look keep their shape', () => {
	for (const model of STAGE3_MODELS) {
		it(`${model} keeps meshes, triangles and bounds`, () => {
			stage3Dims(model).forEach((dims, i) => {
				const expected = (baseline as Record<string, unknown>)[`${model}#${i}`];
				expect(stats(build(model, dims)), `${model}#${i}`).toEqual(expected);
				expect(stats(build(model, dims, {})), `${model}#${i} empty`).toEqual(expected);
			});
		});
	}
});
