import { describe, expect, it } from 'vitest';
import { selectableTypes } from './roomType.ts';

describe('selectableTypes', () => {
	it('hides outdoor types for indoor rooms', () => {
		const types = selectableTypes('living');
		expect(types).toContain('kitchen');
		expect(types).not.toContain('balcony');
		expect(types).not.toContain('winterGarden');
	});

	it('keeps the current outdoor type visible', () => {
		expect(selectableTypes('terrace')).toContain('terrace');
		expect(selectableTypes('terrace')).not.toContain('garden');
	});
});
