import { describe, expect, it } from 'vitest';
import { isAutoName, uniqueName } from './naming.ts';

const names = {
	de: {
		living: 'Wohnzimmer',
		bedroom: 'Schlafzimmer',
		office: 'Büro',
		kitchen: 'Küche',
		bath: 'Bad',
		kids: 'Kinderzimmer',
		hall: 'Flur',
		dining: 'Esszimmer',
		storage: 'Abstellraum',
		other: 'Andere'
	},
	en: {
		living: 'Living room',
		bedroom: 'Bedroom',
		office: 'Office',
		kitchen: 'Kitchen',
		bath: 'Bathroom',
		kids: "Children's room",
		hall: 'Hallway',
		dining: 'Dining room',
		storage: 'Storage room',
		other: 'Other'
	}
};

describe('naming', () => {
	it('recognises generated names', () => {
		expect(isAutoName('', names)).toBe(true);
		expect(isAutoName('Raum 3', names)).toBe(true);
		expect(isAutoName('Schlafzimmer 2', names)).toBe(true);
		expect(isAutoName('Bedroom', names)).toBe(true);
		expect(isAutoName('Annas Zimmer', names)).toBe(false);
	});

	it('numbers duplicates', () => {
		expect(uniqueName('Bad', [])).toBe('Bad');
		expect(uniqueName('Bad', ['Bad'])).toBe('Bad 2');
		expect(uniqueName('Bad', ['Bad', 'Bad 2'])).toBe('Bad 3');
	});
});
