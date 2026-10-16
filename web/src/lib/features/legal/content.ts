import type { Language } from '#lib/core/units.ts';
import { DEFAULT_MIRROR_RELAYS, DEFAULT_MIRROR_STUN } from '#lib/mirror/config.ts';
import {
	COPYRIGHT_YEAR,
	LICENSE_URL,
	OPERATOR_ADDRESS,
	OPERATOR_EMAIL,
	OPERATOR_NAME,
	PUBLIC_URL,
	REPOSITORY_URL,
	displayUrl
} from './operator.ts';

export type LegalEdition = 'public' | 'selfHosted';

export type LegalBlock = { edition?: LegalEdition } & (
	| { kind: 'p'; text: string }
	| { kind: 'note'; text: string }
	| { kind: 'list'; items: string[] }
	| { kind: 'licenses' }
);

export interface LegalSection {
	id: string;
	title: string;
	edition?: LegalEdition;
	blocks: LegalBlock[];
}

export interface LegalPart {
	id: 'datenschutz' | 'haftung' | 'lizenzen';
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

export const GITHUB_PRIVACY_URL: Record<Language, string> = {
	de: 'https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement',
	en: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'
};
export const SUPERVISORY_URL = 'https://www.edoeb.admin.ch';

const MIRROR_HOSTS = DEFAULT_MIRROR_RELAYS.map((relay) => relay.replace('wss://', '')).join(', ');

export const MIRROR_STUN_HOSTS = [
	...new Set(DEFAULT_MIRROR_STUN.map((server) => server.replace(/^stun:/, '').replace(/:\d+$/, '')))
].join(', ');

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
const licenses = (): LegalBlock => ({ kind: 'licenses' });

function contactItems(labels: {
	operator: string;
	address: string;
	email: string;
	source: string;
}): string[] {
	return [
		`**${labels.operator}:** ${OPERATOR_NAME}`,
		...(OPERATOR_ADDRESS ? [`**${labels.address}:** ${OPERATOR_ADDRESS}`] : []),
		...(OPERATOR_EMAIL
			? [`**${labels.email}:** [${OPERATOR_EMAIL}](mailto:${OPERATOR_EMAIL})`]
			: []),
		`**${labels.source}:** [${displayUrl(REPOSITORY_URL)}](${REPOSITORY_URL})`
	];
}

const de: LegalDocument = {
	updated: LEGAL_UPDATED,
	summary: 'Kurz gesagt: Deine Daten bleiben auf deinem Gerät.',
	lead: [
		p(
			'RoomX hat keine Konten, setzt keine Cookies und misst nichts. Projekte und Fotos liegen nur in deinem Browser. Was du mit einem KI-Assistenten oder als Backup weitergibst, entscheidest du selbst.',
			'public'
		),
		p(
			'RoomX hat keine Konten, setzt keine Cookies und misst nichts. Projekte und Fotos liegen in deinem Browser. Nur wenn du einen Abgleich-Server einrichtest, liegen sie zusätzlich dort. Was du mit einem KI-Assistenten oder als Backup weitergibst, entscheidest du selbst.',
			'selfHosted'
		)
	],
	parts: [
		{
			id: 'datenschutz',
			title: 'Datenschutz',
			intro:
				'Kurz und schlicht: Was RoomX mit Daten macht. Grundlage ist das schweizerische Datenschutzgesetz (DSG); sinngemäss passt es auch für Nutzende in der EU (DSGVO).',
			sections: [
				{
					id: 'verantwortlich',
					title: 'Verantwortlicher und Kontakt',
					blocks: [
						list(
							contactItems({
								operator: 'Verantwortlich',
								address: 'Adresse',
								email: 'Kontakt',
								source: 'Quellcode'
							})
						)
					]
				},
				{
					id: 'lokal',
					title: 'Deine Daten bleiben bei dir',
					blocks: [
						list([
							'Keine Konten, keine Cookies, kein Tracking',
							'Keine externen Schriften, Skripte oder CDNs: alles Nötige steckt in der App',
							'**Projektdaten** (Räume, Möbel, Notizen, Fotos, Einstellungen) liegen nur im Browser deines Geräts',
							'**Fotos** werden lokal verkleinert; Standortdaten (GPS) und weitere Metadaten werden entfernt'
						]),
						p('Der Betreiber hat keinen Zugriff auf diese Daten.', 'public')
					]
				},
				{
					id: 'handyfotos',
					title: 'Mit dem Handy fotografieren',
					blocks: [
						p(
							`Nur für die Funktion «Mit dem Handy fotografieren» verbinden sich PC und Handy über öffentliche Vermittlungsdienste: Nostr-Relays (${MIRROR_HOSTS}) und öffentliche STUN-Server (${MIRROR_STUN_HOSTS}). Das geschieht nur, solange ein Foto-Auftrag offen ist und RoomX auf dem Gerät offen ist. Sonst geht keine Anfrage nach aussen.`
						),
						p(
							'Diese Dienste sehen IP-Adressen und verschlüsselte Verbindungsdaten, nie Fotos, Raumdaten oder Projekte. Die Fotos gehen direkt zwischen deinen eigenen Geräten (WebRTC) und sind zusätzlich Ende-zu-Ende verschlüsselt (AES-256-GCM). Der Schlüssel steht nur im QR-Code und im Link.'
						),
						p(
							'Der Link enthält die Namen und Grundrisse der gewählten Räume. Teile ihn nur mit Personen, denen du diese anvertraust. Ein Auftrag gilt 7 Tage; «Auftrag beenden» macht ihn sofort ungültig. Schickst du Fotos stattdessen über das Teilen-Menü (AirDrop, Quick Share, E-Mail, Cloud), laufen sie über den Dienst, den du wählst.'
						),
						p(
							'Mit deinem eigenen Server lädt das Handy die Fotos zusätzlich verschlüsselt dorthin hoch. Der Server kann sie nicht lesen und löscht sie, sobald der Computer sie abgeholt hat.',
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
							`Die App wird über GitHub Pages ausgeliefert (GitHub, USA). Dabei verarbeitet GitHub technisch notwendige Zugriffsdaten wie deine IP-Adresse in Server-Logs und übermittelt sie in die USA. Der Betreiber von RoomX erhält diese Daten nicht. Mehr dazu in der [Datenschutzerklärung von GitHub](${GITHUB_PRIVACY_URL.de}).`
						)
					]
				},
				{
					id: 'server',
					title: 'Hosting und Abgleich',
					edition: 'selfHosted',
					blocks: [
						p(
							'Du verwendest eine selbst gehostete Version. Hosting und Abgleich liegen bei deren Betreiberin oder Betreiber, die oder der dafür verantwortlich ist. Der Server kann technische Zugriffsdaten wie die IP-Adresse protokollieren.'
						),
						p(
							'Trägst du in den Einstellungen einen Abgleich-Server ein, werden deine Projekte und Fotos dorthin übertragen. Ohne diese Angaben findet kein Abgleich statt. Auskunft und Löschung verlangst du bei der Betreiberin oder dem Betreiber.'
						)
					]
				},
				{
					id: 'weitergabe',
					title: 'Weitergabe nur durch dich',
					blocks: [
						p(
							'Daten verlassen dein Gerät nur, wenn du selbst ein KI-Paket oder ein Backup teilst. Dann gelten die Bedingungen des Dienstes, den du wählst. Prüfe vorher, ob Fotos oder Angaben Personen oder Privates zeigen.'
						)
					]
				},
				{
					id: 'loeschen',
					title: 'Löschen',
					blocks: [
						p(
							'In den Einstellungen löscht «Alle lokalen Daten löschen» alle Projekte, Fotos und Einstellungen von diesem Gerät. Geteilte Dateien löschst du dort, wo du sie abgelegt hast.'
						)
					]
				},
				{
					id: 'rechte',
					title: 'Deine Rechte',
					blocks: [
						p(
							`Du kannst Auskunft, Berichtigung und Löschung deiner Personendaten verlangen. Wende dich dafür an den Kontakt oben. Beschwerden gehen an den [Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB)](${SUPERVISORY_URL}), in der EU an die Aufsichtsbehörde deines Wohnorts.`
						)
					]
				}
			]
		},
		{
			id: 'haftung',
			title: 'Haftungsausschluss und Nutzungshinweise',
			intro:
				'RoomX ist ein kostenloses Hilfsmittel, um Räume zu erfassen und einzurichten. Du nutzt es auf eigene Verantwortung.',
			sections: [
				{
					id: 'nutzung',
					title: 'Nutzung auf eigene Verantwortung',
					blocks: [
						p(
							'RoomX wird kostenlos und «wie besehen» zur Verfügung gestellt, ohne Garantie für Fehlerfreiheit, Verfügbarkeit oder Eignung für einen bestimmten Zweck. Die App kann jederzeit geändert, eingeschränkt oder eingestellt werden.'
						)
					]
				},
				{
					id: 'masse',
					title: 'Masse, Preise und Verfügbarkeit',
					blocks: [
						p(
							'Katalogmasse, Preise, Lieferbarkeit und weitere Angaben zu Möbeln sind Richtwerte ohne Gewähr. Sie können veraltet, ungenau oder falsch sein. Artikel mit dem Hinweis «Masse ungeprüft» wurden nicht beim Hersteller geprüft; Preise sind Richtpreise mit Stand-Angabe. Prüfe Masse, Preise und Verfügbarkeit vor dem Kauf beim Händler. Auch Berechnungen und Prüfhinweise in der App (zum Beispiel Flächen, Abstände oder Platzprüfungen) ersetzen das Nachmessen vor Ort nicht. Darstellungen von Möbeln in Plan und 3D sind vereinfacht und weichen vom echten Produkt ab.'
						)
					]
				},
				{
					id: 'ki',
					title: 'Vorschläge eines KI-Assistenten',
					blocks: [
						p(
							'Wenn du ein KI-Paket mit einem KI-Assistenten nutzt, sind dessen Vorschläge nicht geprüft. Sie können falsch, unvollständig oder unpassend sein. Du entscheidest, ob du sie übernimmst. Auf den Assistenten und seine Antworten haben RoomX und der Betreiber keinen Einfluss.'
						)
					]
				},
				{
					id: 'fachberatung',
					title: 'Keine Fachberatung',
					blocks: [
						note(
							'RoomX ersetzt keine Planungs-, Bau- oder Elektro-Fachberatung. Lass sicherheitsrelevante Fragen von Fachpersonen klären.'
						),
						list([
							'**Statik:** Eingriffe in tragende Wände, Decken oder Böden dürfen nur nach Prüfung durch eine Fachperson erfolgen.',
							'**Elektro:** Die Elektroplanung in RoomX (Steckdosen, Anschlüsse, Lampen) ist nur eine Skizze. Installationen dürfen nur Fachleute mit der nötigen Bewilligung planen und ausführen, in der Schweiz gemäss NIV (Niederspannungs-Installationsverordnung).',
							'**Wandmontage und Kippsicherung:** Hohe oder schwere Möbel musst du an der Wand sichern. Wähle Befestigungsmaterial passend zur Wand und beachte die Anleitung des Herstellers.',
							'**Vorschriften:** Bau- und Brandschutzvorschriften sowie Vorgaben deiner Vermieterschaft oder Verwaltung musst du selbst klären.'
						])
					]
				},
				{
					id: 'pruefpflicht',
					title: 'Prüfe vor Kauf und Umbau',
					blocks: [
						p(
							'Miss Räume und Möbel vor einem Kauf oder Umbau selbst nach und prüfe Preise und Lieferbarkeit beim Anbieter. Verlasse dich nicht allein auf RoomX, bevor du etwas kaufst, baust oder montierst.'
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
							'Sicherungen sind deine Sache: Erstelle regelmässig ein Backup (im Menü des Projekts: «Backup (ZIP)») und bewahre es getrennt vom Gerät auf. Für Datenverlust wird, soweit gesetzlich zulässig, nicht gehaftet.'
						)
					]
				},
				{
					id: 'links',
					title: 'Externe Links',
					blocks: [
						p(
							'RoomX verlinkt auf Seiten Dritter, zum Beispiel auf Möbelhäuser. Für deren Inhalte, Angebote und Datenschutz sind allein die jeweiligen Betreiber verantwortlich. Wenn dir ein defekter oder unpassender Link auffällt, melde ihn über den Kontakt in der Datenschutzerklärung.'
						)
					]
				},
				{
					id: 'marken',
					title: 'Marken',
					blocks: [
						p(
							'Namen wie IKEA, PAX, Tchibo, JYSK, CN3 und weitere Marken-, Firmen- und Produktnamen gehören ihren jeweiligen Inhabern. RoomX nennt sie nur, um Möbel zu beschreiben. Es besteht keine Verbindung zu diesen Unternehmen oder zu den Herstellern, und sie unterstützen oder empfehlen RoomX nicht.'
						)
					]
				},
				{
					id: 'haftung',
					title: 'Haftung',
					blocks: [
						p(
							'Soweit gesetzlich zulässig, haftet der Betreiber nicht für Schäden, die aus der Nutzung von RoomX oder aus dem Vertrauen auf Katalogangaben, Berechnungen oder KI-Vorschläge entstehen. Das gilt insbesondere für Fehlkäufe, Vermögens- und Folgeschäden, Datenverlust sowie Schäden an Gebäude, Möbeln oder Installationen.'
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
		},
		{
			id: 'lizenzen',
			title: 'Urheberrecht und Lizenzen',
			intro: 'Wem RoomX gehört und welche freie Software darin steckt.',
			sections: [
				{
					id: 'urheberrecht',
					title: 'Urheberrecht und Lizenz',
					blocks: [
						p(`**© ${COPYRIGHT_YEAR} ${OPERATOR_NAME}**`),
						list([
							'Den Quellcode von RoomX darfst du für nicht kommerzielle Zwecke ansehen, kopieren und verändern.',
							`Die App unter [${displayUrl(PUBLIC_URL)}](${PUBLIC_URL}) darf jede Person und jedes Unternehmen nutzen, auch beruflich.`,
							'Verkaufen, weitergeben oder als eigenen Dienst anbieten ist nicht erlaubt, ausser im Rahmen der Lizenz für nicht kommerzielle Zwecke.'
						]),
						p(
							`Massgeblich ist der Lizenztext: [LICENSE](${LICENSE_URL}) im Quellcode (PolyForm Noncommercial License 1.0.0 mit Zusatzerlaubnis).`
						)
					]
				},
				{
					id: 'schrift',
					title: 'Schrift',
					blocks: [
						p(
							'RoomX verwendet die Schrift Figtree (SIL Open Font License 1.1). Sie ist in der App enthalten und wird nicht von einem fremden Server geladen.'
						)
					]
				},
				{
					id: 'drittanbieter',
					title: 'Open-Source-Software von Dritten',
					blocks: [
						p(
							'RoomX baut auf freier Software auf. Hier siehst du die Pakete, die in der App mitgeliefert werden, mit ihrer Lizenz und, wo vorhanden, dem Lizenztext. Die Liste wird beim Erstellen der App automatisch erzeugt.'
						),
						licenses()
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
			'RoomX has no accounts, sets no cookies and measures nothing. Projects and photos are stored only in your browser. What you share with an AI assistant or as a backup is up to you.',
			'public'
		),
		p(
			'RoomX has no accounts, sets no cookies and measures nothing. Projects and photos are stored in your browser. Only if you set up a sync server are they stored there as well. What you share with an AI assistant or as a backup is up to you.',
			'selfHosted'
		)
	],
	parts: [
		{
			id: 'datenschutz',
			title: 'Privacy',
			intro:
				'Short and plain: what RoomX does with data. It follows the Swiss Federal Act on Data Protection (FADP) and also fits users in the EU (GDPR).',
			sections: [
				{
					id: 'verantwortlich',
					title: 'Controller and contact',
					blocks: [
						list(
							contactItems({
								operator: 'Responsible',
								address: 'Address',
								email: 'Contact',
								source: 'Source code'
							})
						)
					]
				},
				{
					id: 'lokal',
					title: 'Your data stays with you',
					blocks: [
						list([
							'No accounts, no cookies, no tracking',
							'No external fonts, scripts or CDNs: everything needed is part of the app',
							'**Project data** (rooms, furniture, notes, photos, settings) is stored only in the browser on your device',
							'**Photos** are downsized locally; location data (GPS) and other metadata are removed'
						]),
						p('The operator has no access to this data.', 'public')
					]
				},
				{
					id: 'handyfotos',
					title: 'Taking photos with your phone',
					blocks: [
						p(
							`Only for the “Take photos with your phone” feature, the PC and the phone connect through public relay services: Nostr relays (${MIRROR_HOSTS}) and public STUN servers (${MIRROR_STUN_HOSTS}). This happens only while a photo job is open and RoomX is open on the device. Otherwise no request goes out.`
						),
						p(
							'These services see IP addresses and encrypted connection data, never photos, room data or projects. Photos travel directly between your own devices (WebRTC) and are additionally end-to-end encrypted (AES-256-GCM). The key is only in the QR code and the link.'
						),
						p(
							'The link contains the names and floor plans of the chosen rooms. Share it only with people you trust with them. A job is valid for 7 days; “End job” makes it invalid at once. If you send photos through the share sheet instead (AirDrop, Quick Share, email, cloud), they travel through the service you choose.'
						),
						p(
							'With your own server, the phone also uploads the photos there, encrypted. The server cannot read them and deletes them as soon as the computer has picked them up.',
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
							`The app is served through GitHub Pages (GitHub, USA). GitHub processes technically necessary access data such as your IP address in server logs and transfers it to the USA. The operator of RoomX does not receive this data. More in the [GitHub privacy statement](${GITHUB_PRIVACY_URL.en}).`
						)
					]
				},
				{
					id: 'server',
					title: 'Hosting and sync',
					edition: 'selfHosted',
					blocks: [
						p(
							'You are using a self-hosted version. Hosting and sync are run by its operator, who is responsible for them. The server may log technical access data such as the IP address.'
						),
						p(
							'If you enter a sync server in the settings, your projects and photos are transferred to it. Without these details, nothing is synced. Ask the operator for access and deletion.'
						)
					]
				},
				{
					id: 'weitergabe',
					title: 'Sharing only by you',
					blocks: [
						p(
							'Data leaves your device only when you share an AI package or a backup yourself. The terms of the service you choose then apply. Before sharing, check whether photos or details show people or private matters.'
						)
					]
				},
				{
					id: 'loeschen',
					title: 'Deletion',
					blocks: [
						p(
							'In the settings, “Delete all local data” removes all projects, photos and settings from this device. You delete shared files where you stored them.'
						)
					]
				},
				{
					id: 'rechte',
					title: 'Your rights',
					blocks: [
						p(
							`You can request access to, correction and deletion of your personal data. Use the contact above. Complaints go to the [Federal Data Protection and Information Commissioner (FDPIC)](${SUPERVISORY_URL}), in the EU to the supervisory authority where you live.`
						)
					]
				}
			]
		},
		{
			id: 'haftung',
			title: 'Disclaimer and usage notes',
			intro:
				'RoomX is a free tool for capturing and furnishing rooms. You use it at your own risk.',
			sections: [
				{
					id: 'nutzung',
					title: 'Use at your own risk',
					blocks: [
						p(
							'RoomX is provided free of charge and “as is”, without any warranty of being error-free, available or fit for a particular purpose. The app may be changed, restricted or discontinued at any time.'
						)
					]
				},
				{
					id: 'masse',
					title: 'Dimensions, prices and availability',
					blocks: [
						p(
							'Catalogue dimensions, prices, availability and other details about furniture are guide values without guarantee. They may be outdated, inaccurate or wrong. Articles marked “Dimensions unverified” have not been checked with the manufacturer; prices are guide prices with a date. Check dimensions, prices and availability with the retailer before buying. Calculations and checks in the app (for example areas, clearances or space checks) do not replace measuring on site. Furniture shown in the plan and in 3D is simplified and differs from the real product.'
						)
					]
				},
				{
					id: 'ki',
					title: 'AI assistant suggestions',
					blocks: [
						p(
							'If you use an AI package with an AI assistant, its suggestions are not verified. They may be wrong, incomplete or unsuitable. It is up to you whether to follow them. RoomX and the operator have no influence on the assistant or its answers.'
						)
					]
				},
				{
					id: 'fachberatung',
					title: 'No professional advice',
					blocks: [
						note(
							'RoomX does not replace professional planning, construction or electrical advice. Have safety-related questions answered by qualified professionals.'
						),
						list([
							'**Structure:** work on load-bearing walls, ceilings or floors may only be done after a professional has checked it.',
							'**Electrical:** the electrical planning in RoomX (sockets, connections, lamps) is only a sketch. Installations may only be planned and carried out by professionals with the required authorisation, in Switzerland under the NIV (low-voltage installations ordinance).',
							'**Wall mounting and tip-over protection:** you must secure tall or heavy furniture to the wall. Choose fixings suited to the wall and follow the manufacturer’s instructions.',
							'**Regulations:** you must clarify building and fire regulations and the rules of your landlord or property management yourself.'
						])
					]
				},
				{
					id: 'pruefpflicht',
					title: 'Check before you buy or build',
					blocks: [
						p(
							'Measure rooms and furniture yourself before buying or renovating, and check prices and availability with the retailer. Do not rely on RoomX alone before you buy, build or install anything.'
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
							'Backups are your responsibility: please create them regularly (in the project menu: “Backup (ZIP)”) and keep them apart from the device. To the extent permitted by law, there is no liability for data loss.'
						)
					]
				},
				{
					id: 'links',
					title: 'External links',
					blocks: [
						p(
							'RoomX links to third-party websites, for example furniture retailers. Their operators alone are responsible for their content, offers and privacy practices. If you notice a broken or unsuitable link, report it through the contact in the privacy policy.'
						)
					]
				},
				{
					id: 'marken',
					title: 'Trademarks',
					blocks: [
						p(
							'Names such as IKEA, PAX, Tchibo, JYSK, CN3 and other trademarks, company names and product names belong to their respective owners. RoomX mentions them only to describe furniture. There is no connection to these companies or to the manufacturers, and they neither support nor endorse RoomX.'
						)
					]
				},
				{
					id: 'haftung',
					title: 'Liability',
					blocks: [
						p(
							'To the extent permitted by law, the operator is not liable for damage arising from the use of RoomX or from relying on catalogue details, calculations or AI suggestions. This applies in particular to wrong purchases, financial and consequential loss, data loss, and damage to buildings, furniture or installations.'
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
		},
		{
			id: 'lizenzen',
			title: 'Copyright and licences',
			intro: 'Who owns RoomX and which open-source software it contains.',
			sections: [
				{
					id: 'urheberrecht',
					title: 'Copyright and licence',
					blocks: [
						p(`**© ${COPYRIGHT_YEAR} ${OPERATOR_NAME}**`),
						list([
							'You may view, copy and modify the source code of RoomX for noncommercial purposes.',
							`Any person and any company may use the app at [${displayUrl(PUBLIC_URL)}](${PUBLIC_URL}), including for work.`,
							'Selling it, passing it on or offering it as a service of your own is not allowed, except within the licence for noncommercial purposes.'
						]),
						p(
							`The licence text is authoritative: [LICENSE](${LICENSE_URL}) in the source code (PolyForm Noncommercial License 1.0.0 with an additional permission).`
						)
					]
				},
				{
					id: 'schrift',
					title: 'Typeface',
					blocks: [
						p(
							'RoomX uses the typeface Figtree (SIL Open Font License 1.1). It is included in the app and not loaded from an outside server.'
						)
					]
				},
				{
					id: 'drittanbieter',
					title: 'Third-party open-source software',
					blocks: [
						p(
							'RoomX is built on open-source software. Below are the packages shipped with the app, with their licence and, where available, the licence text. The list is generated automatically when the app is built.'
						),
						licenses()
					]
				}
			]
		}
	]
};

export const legalContent: Record<Language, LegalDocument> = { de, en };
