import type { Language } from '#lib/core/units.ts';
import {
	CONTACT_URL,
	OPERATOR_ADDRESS,
	OPERATOR_EMAIL,
	OPERATOR_NAME,
	PUBLIC_URL,
	REPOSITORY_URL,
	displayUrl
} from './operator.ts';

export type LegalEdition = 'public' | 'selfHosted';

export type LegalBlock = { edition?: LegalEdition } & (
	{ kind: 'p'; text: string } | { kind: 'note'; text: string } | { kind: 'list'; items: string[] }
);

export interface LegalSection {
	id: string;
	title: string;
	edition?: LegalEdition;
	blocks: LegalBlock[];
}

export interface LegalPart {
	id: 'datenschutz' | 'haftung';
	title: string;
	intro: string;
	sections: LegalSection[];
}

export interface LegalDocument {
	updated: string;
	summary: string;
	lead: LegalBlock[];
	parts: LegalPart[];
}

export const GITHUB_PRIVACY_URL =
	'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';
export const SUPERVISORY_URL = 'https://www.edoeb.admin.ch';

export const LEGAL_UPDATED = '2026-10-15';

const withEdition = <T extends object>(
	block: T,
	edition?: LegalEdition
): T & { edition?: LegalEdition } => (edition ? { ...block, edition } : block);

const p = (text: string, edition?: LegalEdition): LegalBlock =>
	withEdition({ kind: 'p', text }, edition);
const note = (text: string, edition?: LegalEdition): LegalBlock =>
	withEdition({ kind: 'note', text }, edition);
const list = (items: string[], edition?: LegalEdition): LegalBlock =>
	withEdition({ kind: 'list', items }, edition);

function contactItems(labels: {
	operator: string;
	role: string;
	address: string;
	email: string;
	contact: string;
	source: string;
}): string[] {
	return [
		`**${labels.operator}:** ${OPERATOR_NAME}, ${labels.role}`,
		...(OPERATOR_ADDRESS ? [`**${labels.address}:** ${OPERATOR_ADDRESS}`] : []),
		...(OPERATOR_EMAIL
			? [`**${labels.email}:** [${OPERATOR_EMAIL}](mailto:${OPERATOR_EMAIL})`]
			: []),
		`**${labels.contact}:** [GitHub Issues](${CONTACT_URL})`,
		`**${labels.source}:** [${displayUrl(REPOSITORY_URL)}](${REPOSITORY_URL})`
	];
}

const de: LegalDocument = {
	updated: LEGAL_UPDATED,
	summary: 'Kurz gesagt: Deine Daten bleiben auf deinem Gerät.',
	lead: [
		p(
			'roomx hat keine Konten, setzt keine Cookies und misst nichts. Projekte und Fotos liegen nur in deinem Browser. Was du mit einem KI-Assistenten oder als Backup weitergibst, entscheidest du selbst.',
			'public'
		),
		p(
			'roomx hat keine Konten, setzt keine Cookies und misst nichts. Projekte und Fotos liegen in deinem Browser. Nur wenn du einen Abgleich-Server einrichtest, liegen sie zusätzlich dort. Was du mit einem KI-Assistenten oder als Backup weitergibst, entscheidest du selbst.',
			'selfHosted'
		)
	],
	parts: [
		{
			id: 'datenschutz',
			title: 'Datenschutzerklärung',
			intro:
				'Diese Erklärung zeigt dir, wie roomx mit Daten umgeht. Sie richtet sich nach dem schweizerischen Datenschutzgesetz (DSG) und gilt sinngemäss auch für Nutzende in der EU und im EWR (DSGVO).',
			sections: [
				{
					id: 'verantwortlich',
					title: 'Verantwortlicher und Kontakt',
					blocks: [
						p(
							`Verantwortlich für die öffentliche Version von roomx unter [${displayUrl(PUBLIC_URL)}](${PUBLIC_URL}) ist der Betreiber:`
						),
						list(
							contactItems({
								operator: 'Betreiber',
								role: 'Privatperson in der Schweiz',
								address: 'Adresse',
								email: 'E-Mail',
								contact: 'Kontakt',
								source: 'Quellcode'
							})
						),
						p(
							'Fragen zum Datenschutz kannst du über den GitHub-Kontakt stellen. Meldungen dort sind öffentlich: Schreibe bitte keine persönlichen Angaben und keine Plandaten hinein.'
						)
					]
				},
				{
					id: 'geltung',
					title: 'Geltungsbereich',
					blocks: [
						p(
							'Diese Erklärung gilt für die öffentliche Version von roomx. Daneben kann roomx selbst gehostet werden, zum Beispiel als private Instanz mit optionalem Abgleich-Server. Für eine solche Instanz ist deren Betreiberin oder Betreiber verantwortlich, nicht der Betreiber der öffentlichen Version.',
							'public'
						),
						p(
							'Du verwendest eine selbst gehostete Instanz von roomx. Für den Server dieser Instanz ist deren Betreiberin oder Betreiber verantwortlich. Für die App selbst gilt diese Erklärung sinngemäss.',
							'selfHosted'
						)
					]
				},
				{
					id: 'lokal',
					title: 'Was auf deinem Gerät gespeichert wird',
					blocks: [
						p(
							'roomx braucht kein Konto. Alles, was du eingibst, wird im Browser deines Geräts gespeichert:'
						),
						list([
							'**Projekte:** Räume, Masse, Möbel, Notizen und Varianten (IndexedDB)',
							'**Fotos:** deine Raumfotos und eine kleine Vorschau davon (IndexedDB)',
							'**Einstellungen:** zum Beispiel Sprache, Einheit und welche Hinweise du schon gesehen hast (localStorage)',
							'**App-Dateien:** der Browser legt die Dateien der App im Cache ab, damit roomx auch ohne Netz läuft'
						]),
						p(
							'Diese Daten verlassen dein Gerät nicht, solange du sie nicht selbst weitergibst. Der Betreiber hat keinen Zugriff darauf und kann sie weder einsehen noch wiederherstellen.',
							'public'
						),
						p(
							'Ohne Abgleich-Server verlassen diese Daten dein Gerät nicht, solange du sie nicht selbst weitergibst.',
							'selfHosted'
						)
					]
				},
				{
					id: 'nicht',
					title: 'Was nicht passiert',
					blocks: [
						list([
							'Keine Konten und keine Anmeldung',
							'Keine Cookies',
							'Kein Tracking und keine Analyse- oder Werbedienste',
							'Keine Schriften oder Skripte von Drittanbietern: alles Nötige steckt in der App'
						]),
						p(
							'**Die App sendet keine Daten an Server des Betreibers.** Es gibt keinen Abgleich und keine Nutzungsstatistik.',
							'public'
						),
						p(
							'Die App sendet nur dann Daten an einen Server, wenn du in den Einstellungen selbst einen Abgleich-Server einträgst.',
							'selfHosted'
						)
					]
				},
				{
					id: 'hosting',
					title: 'Hosting über GitHub Pages',
					edition: 'public',
					blocks: [
						p(
							'Die Dateien der App liefert GitHub Pages aus, ein Dienst von GitHub (USA). Beim Aufruf verarbeitet GitHub technisch notwendige Zugriffsdaten, insbesondere deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse und Angaben zu deinem Browser. Das geschieht auf den Servern von GitHub. Der Betreiber von roomx erhält diese Daten nicht.'
						),
						p(
							`Dabei können Daten in die USA und in andere Länder gelangen. Es gelten die Bestimmungen von GitHub: [Datenschutzerklärung von GitHub](${GITHUB_PRIVACY_URL}). Die Seite wird verschlüsselt (HTTPS) ausgeliefert.`
						)
					]
				},
				{
					id: 'hosting-instanz',
					title: 'Hosting dieser Instanz',
					edition: 'selfHosted',
					blocks: [
						p(
							'Die Dateien der App liefert der Server dieser Instanz aus. Dessen Betreiberin oder Betreiber kann dabei technische Zugriffsdaten wie die IP-Adresse in Protokollen verarbeiten. Frage dort nach, wenn du Einzelheiten wissen willst.'
						)
					]
				},
				{
					id: 'server',
					title: 'Abgleich-Server',
					edition: 'selfHosted',
					blocks: [
						p(
							'Auf selbst gehosteten Instanzen kannst du in den Einstellungen eine Server-Adresse und ein Zugangs-Token eintragen. Dann gleicht roomx deine Projekte und Fotos mit diesem Server ab. Ohne diese Angaben findet kein Abgleich statt.'
						),
						p(
							'Die abgeglichenen Daten liegen dann auf dem Server der Betreiberin oder des Betreibers dieser Instanz, nicht mehr nur auf deinem Gerät. Diese Person ist dafür verantwortlich. Auskunft, Berichtigung und Löschung verlangst du bei ihr. Löschungen in der App werden beim Abgleich in der Regel auch an den Server weitergegeben.'
						)
					]
				},
				{
					id: 'weitergabe',
					title: 'Weitergabe nur durch dich',
					blocks: [
						p('Daten verlassen dein Gerät nur, wenn du das selbst auslöst:'),
						list([
							'**KI-Paket:** Du kannst ein Paket aus deinem Projekt erstellen (JSON, PDF mit Fotos und eine Anleitung) und mit einem KI-Assistenten deiner Wahl teilen. Dann verarbeitet dieser Anbieter die Daten nach seinen eigenen Bedingungen. Der Betreiber von roomx hat darauf keinen Einfluss.',
							'**Backup und Export:** Eine Datei (zum Beispiel ZIP, PDF oder 3D-Modell), die du speicherst oder verschickst, liegt ausserhalb von roomx. Du entscheidest, wo sie landet und wer sie bekommt.'
						]),
						p(
							'Prüfe vor dem Teilen, ob Fotos oder Angaben Personen, Dokumente oder Privates zeigen. Der Betreiber von roomx erfährt von diesen Weitergaben nichts.'
						)
					]
				},
				{
					id: 'fotos',
					title: 'Fotos und Metadaten',
					blocks: [
						p(
							'Fotos werden beim Hinzufügen direkt im Browser verkleinert und ohne Metadaten gespeichert. Angaben wie der Aufnahmeort (GPS), die Aufnahmezeit oder das Kameramodell werden nicht übernommen.'
						),
						p(
							'Auf den Bildern selbst können trotzdem Personen, Dokumente oder Einblicke in deine Wohnung zu sehen sein. Fotografiere andere Personen nur mit ihrem Einverständnis.'
						)
					]
				},
				{
					id: 'links',
					title: 'Externe Links',
					blocks: [
						p(
							'Der Katalog verweist bei manchen Möbeln auf Seiten von Möbelhäusern, zum Beispiel IKEA oder Tchibo. Diese Seiten öffnen sich nur, wenn du einen Link antippst. Dann gilt die Datenschutzerklärung der jeweiligen Seite, und der Anbieter kann Daten wie deine IP-Adresse verarbeiten. roomx übergibt dabei keine Projektdaten.'
						)
					]
				},
				{
					id: 'sicherheit',
					title: 'Sicherheit',
					blocks: [
						p(
							'Die Daten im Browser sind nicht zusätzlich verschlüsselt. Wer Zugriff auf dein Gerät und dein Browserprofil hat, kann sie lesen. Sperre dein Gerät und halte Browser und Betriebssystem aktuell.'
						)
					]
				},
				{
					id: 'dauer',
					title: 'Speicherdauer und Löschen',
					blocks: [
						p(
							'Deine Daten bleiben auf deinem Gerät, bis du sie löschst. Der Browser kann sie allerdings entfernen, wenn der Speicher knapp wird (siehe Einstellungen, Abschnitt Speicher).'
						),
						list([
							'**Ein Projekt löschen:** in der Projektliste im Menü des Projekts «Löschen» wählen.',
							'**Alles löschen:** die Website-Daten von roomx in den Einstellungen deines Browsers entfernen. Damit verschwinden Projekte, Fotos, Einstellungen und der Cache der App.',
							'**Weitergegebene Daten:** Dateien, die du gespeichert oder verschickt hast, und Daten bei einem KI-Assistenten löschst du dort selbst.'
						]),
						p(
							'Daten auf dem Abgleich-Server kannst du bei der Betreiberin oder dem Betreiber dieser Instanz löschen lassen.',
							'selfHosted'
						)
					]
				},
				{
					id: 'rechte',
					title: 'Deine Rechte',
					blocks: [
						p(
							'Nach dem DSG und sinngemäss nach der DSGVO kannst du Auskunft über deine Personendaten verlangen und sie berichtigen, löschen, einschränken oder herausgeben lassen. Du kannst der Bearbeitung auch widersprechen.'
						),
						p(
							'Weil der Betreiber von roomx keine Personendaten über dich bearbeitet, liegen deine Daten bei dir selbst: Du kannst sie in der App jederzeit ansehen, als Backup exportieren und löschen. Für die Zugriffsdaten beim Hosting wendest du dich an GitHub.',
							'public'
						),
						p(
							'Die Daten auf deinem Gerät liegen bei dir selbst: Du kannst sie in der App jederzeit ansehen, als Backup exportieren und löschen. Für Daten auf dem Abgleich-Server wendest du dich an die Betreiberin oder den Betreiber dieser Instanz.',
							'selfHosted'
						),
						p(
							`Für Anliegen an den Betreiber von roomx nutze den oben genannten Kontakt. Du kannst dich auch bei einer Datenschutzbehörde beschweren, in der Schweiz beim [Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB)](${SUPERVISORY_URL}), in der EU bei der Aufsichtsbehörde deines Wohnorts.`
						)
					]
				},
				{
					id: 'aenderungen',
					title: 'Änderungen dieser Erklärung',
					blocks: [
						p(
							`Der Betreiber kann diese Erklärung anpassen, zum Beispiel wenn roomx neue Funktionen erhält. Es gilt die Fassung, die in der App steht; das Datum oben zeigt den Stand. Frühere Fassungen findest du in der Versionsgeschichte des [Quellcodes](${REPOSITORY_URL}).`
						)
					]
				}
			]
		},
		{
			id: 'haftung',
			title: 'Haftungsausschluss und Nutzungshinweise',
			intro:
				'roomx ist ein kostenloses Hilfsmittel, um Räume zu erfassen und einzurichten. Du nutzt es auf eigene Verantwortung.',
			sections: [
				{
					id: 'nutzung',
					title: 'Nutzung auf eigene Verantwortung',
					blocks: [
						p(
							'roomx wird kostenlos und «wie besehen» zur Verfügung gestellt, ohne Garantie für Fehlerfreiheit, Verfügbarkeit oder Eignung für einen bestimmten Zweck. Die App kann jederzeit geändert, eingeschränkt oder eingestellt werden.'
						)
					]
				},
				{
					id: 'masse',
					title: 'Masse, Preise und Verfügbarkeit',
					blocks: [
						p(
							'Katalogmasse, Preise, Lieferbarkeit und weitere Angaben zu Möbeln sind Richtwerte ohne Gewähr. Sie können veraltet, ungenau oder falsch sein. Auch Berechnungen und Prüfhinweise in der App (zum Beispiel Flächen, Abstände oder Platzprüfungen) ersetzen das Nachmessen vor Ort nicht. Darstellungen von Möbeln in Plan und 3D sind vereinfacht und weichen vom echten Produkt ab.'
						)
					]
				},
				{
					id: 'ki',
					title: 'Vorschläge eines KI-Assistenten',
					blocks: [
						p(
							'Wenn du ein KI-Paket mit einem KI-Assistenten nutzt, sind dessen Vorschläge nicht geprüft. Sie können falsch, unvollständig oder unpassend sein. Du entscheidest, ob du sie übernimmst. Auf den Assistenten und seine Antworten haben roomx und der Betreiber keinen Einfluss.'
						)
					]
				},
				{
					id: 'fachberatung',
					title: 'Keine Fachberatung',
					blocks: [
						note(
							'roomx ersetzt keine Planungs-, Bau- oder Elektro-Fachberatung. Lass sicherheitsrelevante Fragen von Fachpersonen klären.'
						),
						list([
							'**Statik:** Eingriffe in tragende Wände, Decken oder Böden dürfen nur nach Prüfung durch eine Fachperson erfolgen.',
							'**Elektro:** Steckdosen, Leitungen, Lampenanschlüsse und andere Elektroinstallationen dürfen nur Elektrofachleute planen und ausführen.',
							'**Wandbefestigung:** Hohe oder schwere Möbel musst du sichern. Wähle Befestigungsmaterial passend zur Wand und beachte die Anleitung des Herstellers.',
							'**Vorschriften:** Bau- und Brandschutzvorschriften sowie Vorgaben deiner Vermieterschaft oder Verwaltung musst du selbst klären.'
						])
					]
				},
				{
					id: 'pruefpflicht',
					title: 'Prüfe vor Kauf und Umbau',
					blocks: [
						p(
							'Miss Räume und Möbel vor einem Kauf oder Umbau selbst nach und prüfe Preise und Lieferbarkeit beim Anbieter. Verlasse dich nicht allein auf roomx, bevor du etwas kaufst, baust oder montierst.'
						)
					]
				},
				{
					id: 'datenverlust',
					title: 'Datenverlust und Backups',
					blocks: [
						p(
							'Deine Projekte liegen in erster Linie lokal in deinem Browser. Sie können verloren gehen, zum Beispiel wenn du Website-Daten löschst, der Browser bei Platzmangel Speicher freigibt oder das Gerät defekt ist oder verloren geht. Der Betreiber kann verlorene Daten nicht wiederherstellen.'
						),
						p(
							'Erstelle deshalb regelmässig ein Backup (im Menü des Projekts: «Backup (ZIP)») und bewahre es getrennt vom Gerät auf. Für Datenverlust wird, soweit gesetzlich zulässig, nicht gehaftet.'
						)
					]
				},
				{
					id: 'links',
					title: 'Externe Links',
					blocks: [
						p(
							'roomx verlinkt auf Seiten Dritter, zum Beispiel auf Möbelhäuser. Für deren Inhalte, Angebote und Datenschutz sind allein die jeweiligen Betreiber verantwortlich. Wenn dir ein defekter oder unpassender Link auffällt, melde ihn über den Kontakt in der Datenschutzerklärung.'
						)
					]
				},
				{
					id: 'marken',
					title: 'Marken',
					blocks: [
						p(
							'Namen wie IKEA, Tchibo und weitere Marken-, Firmen- und Produktnamen gehören ihren jeweiligen Inhabern. roomx nennt sie nur, um Möbel zu beschreiben. Es besteht keine Verbindung zu diesen Unternehmen, und sie unterstützen oder empfehlen roomx nicht.'
						)
					]
				},
				{
					id: 'haftung',
					title: 'Haftung',
					blocks: [
						p(
							'Soweit gesetzlich zulässig, haftet der Betreiber nicht für Schäden, die aus der Nutzung von roomx oder aus dem Vertrauen auf Katalogangaben, Berechnungen oder KI-Vorschläge entstehen. Das gilt insbesondere für Fehlkäufe, Vermögens- und Folgeschäden, Datenverlust sowie Schäden an Gebäude, Möbeln oder Installationen.'
						),
						p(
							'Eine Haftung, die sich nach zwingendem Recht nicht ausschliessen lässt, bleibt bestehen, etwa bei Absicht oder grober Fahrlässigkeit oder bei Schäden an Leib und Leben.'
						)
					]
				},
				{
					id: 'recht',
					title: 'Anwendbares Recht',
					blocks: [
						p(
							'Es gilt schweizerisches Recht. Gerichtsstand ist, soweit zulässig, der Wohnsitz des Betreibers in der Schweiz. Zwingende Gerichtsstände, etwa für Verbraucherinnen und Verbraucher, bleiben vorbehalten.'
						)
					]
				}
			]
		}
	]
};

const en: LegalDocument = {
	updated: LEGAL_UPDATED,
	summary: 'In short: your data stays on your device.',
	lead: [
		p(
			'roomx has no accounts, sets no cookies and measures nothing. Projects and photos are stored only in your browser. What you share with an AI assistant or as a backup is up to you.',
			'public'
		),
		p(
			'roomx has no accounts, sets no cookies and measures nothing. Projects and photos are stored in your browser. Only if you set up a sync server are they stored there as well. What you share with an AI assistant or as a backup is up to you.',
			'selfHosted'
		)
	],
	parts: [
		{
			id: 'datenschutz',
			title: 'Privacy policy',
			intro:
				'This policy explains how roomx handles data. It follows the Swiss Federal Act on Data Protection (FADP) and applies by analogy to users in the EU and the EEA (GDPR).',
			sections: [
				{
					id: 'verantwortlich',
					title: 'Controller and contact',
					blocks: [
						p(
							`The public version of roomx at [${displayUrl(PUBLIC_URL)}](${PUBLIC_URL}) is operated by:`
						),
						list(
							contactItems({
								operator: 'Operator',
								role: 'private individual in Switzerland',
								address: 'Address',
								email: 'Email',
								contact: 'Contact',
								source: 'Source code'
							})
						),
						p(
							'You can ask privacy questions through the GitHub contact. Messages there are public, so please do not include personal details or plan data.'
						)
					]
				},
				{
					id: 'geltung',
					title: 'Scope',
					blocks: [
						p(
							'This policy covers the public version of roomx. roomx can also be self-hosted, for example as a private instance with an optional sync server. The person who runs such an instance is responsible for it, not the operator of the public version.',
							'public'
						),
						p(
							'You are using a self-hosted instance of roomx. The person who runs this instance is responsible for its server. For the app itself, this policy applies by analogy.',
							'selfHosted'
						)
					]
				},
				{
					id: 'lokal',
					title: 'What is stored on your device',
					blocks: [
						p(
							'roomx needs no account. Everything you enter is stored in the browser on your device:'
						),
						list([
							'**Projects:** rooms, dimensions, furniture, notes and variants (IndexedDB)',
							'**Photos:** your room photos and a small preview of each (IndexedDB)',
							'**Settings:** for example language, unit and which hints you have already seen (localStorage)',
							'**App files:** the browser caches the files of the app so that roomx also works offline'
						]),
						p(
							'This data does not leave your device unless you share it yourself. The operator has no access to it and can neither view nor restore it.',
							'public'
						),
						p(
							'Without a sync server, this data does not leave your device unless you share it yourself.',
							'selfHosted'
						)
					]
				},
				{
					id: 'nicht',
					title: 'What does not happen',
					blocks: [
						list([
							'No accounts and no sign-in',
							'No cookies',
							'No tracking and no analytics or advertising services',
							'No fonts or scripts from third parties: everything needed is part of the app'
						]),
						p(
							'**The app sends no data to servers of the operator.** There is no sync and no usage statistics.',
							'public'
						),
						p(
							'The app only sends data to a server if you enter a sync server in the settings yourself.',
							'selfHosted'
						)
					]
				},
				{
					id: 'hosting',
					title: 'Hosting on GitHub Pages',
					edition: 'public',
					blocks: [
						p(
							'The files of the app are served by GitHub Pages, a service of GitHub (USA). When you open the app, GitHub processes technically necessary access data, in particular your IP address, date and time, the requested address and details about your browser. This happens on GitHub servers. The operator of roomx does not receive this data.'
						),
						p(
							`Data may be transferred to the USA and other countries. GitHub's terms apply: [GitHub privacy statement](${GITHUB_PRIVACY_URL}). The site is delivered over an encrypted connection (HTTPS).`
						)
					]
				},
				{
					id: 'hosting-instanz',
					title: 'Hosting of this instance',
					edition: 'selfHosted',
					blocks: [
						p(
							'The files of the app are served by the server of this instance. Whoever runs it may process technical access data such as the IP address in log files. Ask them if you want details.'
						)
					]
				},
				{
					id: 'server',
					title: 'Sync server',
					edition: 'selfHosted',
					blocks: [
						p(
							'On self-hosted instances you can enter a server address and an access token in the settings. roomx then syncs your projects and photos with that server. Without these details, nothing is synced.'
						),
						p(
							'The synced data is then stored on the server of the person who runs this instance, not only on your device. That person is responsible for it. Ask them for access, correction and deletion. Deletions in the app are normally passed on to the server when syncing.'
						)
					]
				},
				{
					id: 'weitergabe',
					title: 'Sharing only by you',
					blocks: [
						p('Data leaves your device only when you trigger it yourself:'),
						list([
							'**AI package:** You can create a package from your project (JSON, PDF with photos and instructions) and share it with an AI assistant of your choice. That provider then processes the data under its own terms. The operator of roomx has no influence on this.',
							'**Backup and export:** A file (for example ZIP, PDF or 3D model) that you save or send is outside of roomx. You decide where it ends up and who receives it.'
						]),
						p(
							'Before sharing, check whether photos or details show people, documents or private matters. The operator of roomx does not learn about any of this sharing.'
						)
					]
				},
				{
					id: 'fotos',
					title: 'Photos and metadata',
					blocks: [
						p(
							'Photos are downsized directly in your browser when you add them and are stored without metadata. Details such as the location (GPS), the time of capture or the camera model are not kept.'
						),
						p(
							'The images themselves can still show people, documents or glimpses of your home. Only photograph other people with their consent.'
						)
					]
				},
				{
					id: 'links',
					title: 'External links',
					blocks: [
						p(
							'For some furniture, the catalogue links to the websites of furniture retailers, for example IKEA or Tchibo. These pages open only when you tap a link. The privacy policy of that site then applies, and the provider may process data such as your IP address. roomx passes no project data along.'
						)
					]
				},
				{
					id: 'sicherheit',
					title: 'Security',
					blocks: [
						p(
							'The data in the browser is not additionally encrypted. Anyone with access to your device and your browser profile can read it. Lock your device and keep your browser and operating system up to date.'
						)
					]
				},
				{
					id: 'dauer',
					title: 'Retention and deletion',
					blocks: [
						p(
							'Your data stays on your device until you delete it. The browser may remove it when storage runs low (see Settings, section Storage).'
						),
						list([
							'**Delete a project:** in the project list, open the project menu and choose “Delete”.',
							'**Delete everything:** remove the site data of roomx in your browser settings. This removes projects, photos, settings and the cache of the app.',
							'**Data you shared:** you delete files you saved or sent, and data held by an AI assistant, there yourself.'
						]),
						p(
							'You can have data on the sync server deleted by the person who runs this instance.',
							'selfHosted'
						)
					]
				},
				{
					id: 'rechte',
					title: 'Your rights',
					blocks: [
						p(
							'Under the FADP and, by analogy, the GDPR, you can request access to your personal data and have it corrected, deleted, restricted or handed over. You can also object to processing.'
						),
						p(
							'Because the operator of roomx does not process personal data about you, your data is with you: you can view it in the app at any time, export it as a backup and delete it. For the access data at the hosting provider, contact GitHub.',
							'public'
						),
						p(
							'The data on your device is with you: you can view it in the app at any time, export it as a backup and delete it. For data on the sync server, contact the person who runs this instance.',
							'selfHosted'
						),
						p(
							`For requests to the operator of roomx, use the contact above. You can also lodge a complaint with a data protection authority: in Switzerland the [Federal Data Protection and Information Commissioner (FDPIC)](${SUPERVISORY_URL}), in the EU the supervisory authority where you live.`
						)
					]
				},
				{
					id: 'aenderungen',
					title: 'Changes to this policy',
					blocks: [
						p(
							`The operator may update this policy, for example when roomx gets new features. The version shown in the app applies; the date above shows when it was last changed. Earlier versions are in the version history of the [source code](${REPOSITORY_URL}).`
						)
					]
				}
			]
		},
		{
			id: 'haftung',
			title: 'Disclaimer and usage notes',
			intro:
				'roomx is a free tool for capturing and furnishing rooms. You use it at your own risk.',
			sections: [
				{
					id: 'nutzung',
					title: 'Use at your own risk',
					blocks: [
						p(
							'roomx is provided free of charge and “as is”, without any warranty of being error-free, available or fit for a particular purpose. The app may be changed, restricted or discontinued at any time.'
						)
					]
				},
				{
					id: 'masse',
					title: 'Dimensions, prices and availability',
					blocks: [
						p(
							'Catalogue dimensions, prices, availability and other details about furniture are guide values without guarantee. They may be outdated, inaccurate or wrong. Calculations and checks in the app (for example areas, clearances or space checks) do not replace measuring on site. Furniture shown in the plan and in 3D is simplified and differs from the real product.'
						)
					]
				},
				{
					id: 'ki',
					title: 'AI assistant suggestions',
					blocks: [
						p(
							'If you use an AI package with an AI assistant, its suggestions are not verified. They may be wrong, incomplete or unsuitable. It is up to you whether to follow them. roomx and the operator have no influence on the assistant or its answers.'
						)
					]
				},
				{
					id: 'fachberatung',
					title: 'No professional advice',
					blocks: [
						note(
							'roomx does not replace professional planning, construction or electrical advice. Have safety-related questions answered by qualified professionals.'
						),
						list([
							'**Structure:** work on load-bearing walls, ceilings or floors may only be done after a professional has checked it.',
							'**Electrical:** sockets, cables, lamp connections and other electrical installations may only be planned and carried out by qualified electricians.',
							'**Wall fixing:** you must secure tall or heavy furniture. Choose fixings suited to the wall and follow the manufacturer’s instructions.',
							'**Regulations:** you must clarify building and fire regulations and the rules of your landlord or property management yourself.'
						])
					]
				},
				{
					id: 'pruefpflicht',
					title: 'Check before you buy or build',
					blocks: [
						p(
							'Measure rooms and furniture yourself before buying or renovating, and check prices and availability with the retailer. Do not rely on roomx alone before you buy, build or install anything.'
						)
					]
				},
				{
					id: 'datenverlust',
					title: 'Data loss and backups',
					blocks: [
						p(
							'Your projects are stored primarily on your device, in your browser. They can be lost, for example if you delete site data, if the browser frees storage when space runs low, or if the device breaks or is lost. The operator cannot restore lost data.'
						),
						p(
							'Please create backups regularly (in the project menu: “Backup (ZIP)”) and keep them apart from the device. To the extent permitted by law, there is no liability for data loss.'
						)
					]
				},
				{
					id: 'links',
					title: 'External links',
					blocks: [
						p(
							'roomx links to third-party websites, for example furniture retailers. Their operators alone are responsible for their content, offers and privacy practices. If you notice a broken or unsuitable link, report it through the contact in the privacy policy.'
						)
					]
				},
				{
					id: 'marken',
					title: 'Trademarks',
					blocks: [
						p(
							'Names such as IKEA, Tchibo and other trademarks, company names and product names belong to their respective owners. roomx mentions them only to describe furniture. There is no connection to these companies, and they neither support nor endorse roomx.'
						)
					]
				},
				{
					id: 'haftung',
					title: 'Liability',
					blocks: [
						p(
							'To the extent permitted by law, the operator is not liable for damage arising from the use of roomx or from relying on catalogue details, calculations or AI suggestions. This applies in particular to wrong purchases, financial and consequential loss, data loss, and damage to buildings, furniture or installations.'
						),
						p(
							'Liability that cannot be excluded under mandatory law remains, for example in cases of intent or gross negligence, or for injury to life or health.'
						)
					]
				},
				{
					id: 'recht',
					title: 'Governing law',
					blocks: [
						p(
							'Swiss law applies. To the extent permitted, the place of jurisdiction is the operator’s place of residence in Switzerland. Mandatory places of jurisdiction, for example for consumers, remain reserved.'
						)
					]
				}
			]
		}
	]
};

export const legalContent: Record<Language, LegalDocument> = { de, en };
