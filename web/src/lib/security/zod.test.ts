import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProjectSchema } from '../core/schema.ts';

describe('zod under the content security policy', () => {
	it('is switched to the parser that needs no code generation before any schema is built', () => {
		expect(z.config().jitless).toBe(true);
		expect(ProjectSchema.safeParse({}).success).toBe(false);
	});
});
