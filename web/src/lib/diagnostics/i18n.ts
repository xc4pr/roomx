import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		title: 'Version und Diagnose',
		version: 'Version',
		buildDate: 'Build-Datum',
		edition: 'Ausgabe',
		editionPublic: 'Öffentliche Version, alles bleibt auf deinem Gerät',
		editionServer: 'Eigener Server',
		copy: 'Diagnose kopieren',
		copied: 'Diagnose kopiert. Füge sie in deine Meldung ein.',
		copyFailed: 'Kopieren ging nicht. Markiere den Text unten und kopiere ihn von Hand.',
		hint: 'Die Diagnose enthält nur technische Angaben zu Gerät und App. Keine Projektdaten, Namen oder Fotos.',
		preview: 'Das wird kopiert',
		previewLabel: 'Inhalt der Diagnose',
		feedbackIssues: 'Fehler melden oder Wunsch äussern',
		feedbackIssuesHint:
			'Öffnet GitHub in einem neuen Tab, dafür brauchst du ein Konto. Schreibe keine privaten Angaben und lade keine privaten Fotos hoch.',
		feedbackEmail: 'Per E-Mail schreiben',
		feedbackEmailHint: 'Füge die Diagnose in deine Nachricht ein.'
	},
	en: {
		title: 'Version and diagnostics',
		version: 'Version',
		buildDate: 'Build date',
		edition: 'Edition',
		editionPublic: 'Public version, everything stays on your device',
		editionServer: 'Own server',
		copy: 'Copy diagnostics',
		copied: 'Diagnostics copied. Paste them into your report.',
		copyFailed: 'Copying did not work. Select the text below and copy it by hand.',
		hint: 'The diagnostics only contain technical details about your device and the app. No project data, names or photos.',
		preview: 'What gets copied',
		previewLabel: 'Diagnostics content',
		feedbackIssues: 'Report a bug or suggest an idea',
		feedbackIssuesHint:
			'Opens GitHub in a new tab, you need an account there. Do not include private details and do not upload private photos.',
		feedbackEmail: 'Write an email',
		feedbackEmailHint: 'Paste the diagnostics into your message.'
	}
});
