import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		pageTitle: 'Datenschutz & Haftung',
		footerLink: 'Datenschutz & Haftung',
		contents: 'Inhaltsverzeichnis',
		updated: 'Stand: {date}',
		sections: '{n} Abschnitte anzeigen',
		external: '(öffnet in neuem Tab)',
		copyright: '© {year} {name}, alle Rechte vorbehalten',
		licensesLoading: 'Lizenzen werden geladen',
		licensesMissing:
			'Die Liste der Pakete fehlt in dieser Entwicklungsversion. Sie wird beim Erstellen der App erzeugt.',
		licensesCount: '{n} Pakete',
		licensesCountOne: '1 Paket',
		licenseFont: 'Schrift',
		licenseHomepage: 'Webseite',
		licenseNoText:
			'Dieses Paket liefert keinen Lizenztext mit. Die Lizenz laut Paketangaben ist {license}.'
	},
	en: {
		pageTitle: 'Privacy & liability',
		footerLink: 'Privacy & liability',
		contents: 'Contents',
		updated: 'Last updated: {date}',
		sections: 'Show {n} sections',
		external: '(opens in a new tab)',
		copyright: '© {year} {name}, all rights reserved',
		licensesLoading: 'Loading licences',
		licensesMissing:
			'The list of packages is missing in this development version. It is generated when the app is built.',
		licensesCount: '{n} packages',
		licensesCountOne: '1 package',
		licenseFont: 'Typeface',
		licenseHomepage: 'Website',
		licenseNoText:
			'This package ships no licence text. According to its metadata, the licence is {license}.'
	}
});
