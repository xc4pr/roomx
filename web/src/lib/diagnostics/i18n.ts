import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		title: 'Diagnose',
		version: 'Version',
		buildDate: 'Build-Datum',
		data: 'Daten',
		dataLocal: 'Alles bleibt auf deinem Gerät',
		dataSynced: 'Abgleich mit deinem Server',
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
		title: 'Diagnostics',
		version: 'Version',
		buildDate: 'Build date',
		data: 'Data',
		dataLocal: 'Everything stays on your device',
		dataSynced: 'Synced with your server',
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
