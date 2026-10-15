import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		pageTitle: 'Datenschutz & Haftung',
		footerLink: 'Datenschutz & Haftung',
		contents: 'Inhaltsverzeichnis',
		updated: 'Stand: {date}',
		sections: '{n} Abschnitte anzeigen',
		external: '(öffnet in neuem Tab)'
	},
	en: {
		pageTitle: 'Privacy & liability',
		footerLink: 'Privacy & liability',
		contents: 'Contents',
		updated: 'Last updated: {date}',
		sections: 'Show {n} sections',
		external: '(opens in a new tab)'
	}
});
