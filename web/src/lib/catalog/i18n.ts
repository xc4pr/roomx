import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		loadFailed: 'Der grosse Katalog konnte nicht geladen werden. Es gilt vorerst der Grundkatalog.',
		someRejected: '{n} Katalogeinträge waren ungültig und wurden übersprungen.'
	},
	en: {
		loadFailed: 'The full catalogue could not be loaded. The basic catalogue is used for now.',
		someRejected: '{n} catalogue entries were invalid and have been skipped.'
	}
});
