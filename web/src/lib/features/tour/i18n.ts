import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		cardLabel: 'Geführte Tour',
		announce: 'Schritt {n} von {total}: {title}',
		next: 'Weiter',
		back: 'Zurück',
		skip: 'Überspringen',
		finish: 'Fertig',
		showMe: 'Zeig es mir',
		sampleYes: 'Mit Beispielprojekt',
		sampleNo: 'Ohne Beispiel',
		sampleHint:
			'Auf Wunsch legt die Tour ein kleines Beispielzimmer zum Ausprobieren an. Du kannst es danach wieder löschen.',
		sampleName: 'Beispiel: Wohnzimmer',
		sampleRoom: 'Wohnzimmer',
		sampleFailed: 'Das Beispielprojekt konnte nicht angelegt werden. Die Tour läuft ohne weiter.',
		sampleKept: 'Das Beispielprojekt bleibt in deiner Liste.',
		sampleDelete: 'Löschen',
		shortcutsAction: 'Kürzel',
		settingsAction: 'Einstellungen',
		title_welcome: 'Willkommen bei RoomX',
		text_welcome:
			'Hier misst du Räume ein, baust sie in 3D nach und richtest sie mit einem KI-Assistenten ein. Alles bleibt lokal auf diesem Gerät.',
		title_projects: 'Deine Projekte',
		text_projects:
			'Mit dem Plus legst du ein neues Projekt an. Auf der Karte siehst du das Vorschaubild, im Menü (…) benennst du um, sicherst ein Backup oder löschst.',
		title_plan: 'Der Plan',
		text_plan:
			'Tippe aufs Plus, um einen Raum hinzuzufügen, und zieh ihn an seinen Platz. Tippen wählt aus, doppelt tippen fokussiert, mit zwei Fingern oder dem Mausrad zoomst du.',
		title_dims: 'Masse eingeben',
		text_dims:
			'Trage Länge, Breite und Höhe ein oder nimm eine Vorlage, «Frei» ist für Sonderformen. Ecken ziehst du direkt im Plan, Dachschrägen stellst du im Panel ein.',
		title_elements: 'Türen, Fenster, Steckdosen',
		text_elements:
			'Wähle in der Palette ein Element, tippe auf eine Wand und zieh es an die richtige Stelle. Die Wandansicht zeigt Höhen genau, die Elektro-Ebene blendet Steckdosen ein.',
		title_photos: 'Fotos pro Raum',
		text_photos:
			'Die geführte Foto-Tour begleitet dich Wand für Wand durch den Raum. So fehlt später kein Blickwinkel.',
		title_build: '3D erstellen',
		text_build:
			'«3D erstellen» prüft deinen Plan und baut den Raum in 3D. Dort wechselst du die Wandmodi, gehst durch den Raum und schaltest das Licht an oder aus.',
		title_furnish: 'Einrichten',
		text_furnish:
			'Zieh Möbel aus dem Katalog in den Raum, dreh und stapele sie. Rote Markierungen warnen bei Platzproblemen, Varianten, Budget, Einkaufsliste und Bedarf findest du gleich daneben.',
		title_package: 'Das KI-Paket',
		text_package:
			'Das KI-Paket bündelt PDF und Raumdaten. Lade die Dateien in einen Chat mit einem KI-Assistenten, füge den Prompt ein («Prompt kopieren») und hole seinen Plan mit «Plan importieren» zurück.',
		title_safe: 'Sichern und Abgleich',
		title_safe_local: 'Sichern',
		text_safe:
			'Alles wird automatisch gespeichert, ein Backup (ZIP) holst du jederzeit zurück. Optional gleichst du in den Einstellungen mit einem Server ab, Undo, Redo und «?» sind immer zur Hand.',
		text_safe_local:
			'Alles wird automatisch auf diesem Gerät gespeichert. Mit einem Backup (ZIP) holst du ein Projekt jederzeit zurück oder nimmst es auf ein anderes Gerät mit.',
		text_safe_phone:
			'Alles wird automatisch gespeichert, ein Backup (ZIP) holst du jederzeit zurück. Optional gleichst du in den Einstellungen mit einem Server ab, Rückgängig und Wiederholen sind immer zur Hand.'
	},
	en: {
		cardLabel: 'Guided tour',
		announce: 'Step {n} of {total}: {title}',
		next: 'Next',
		back: 'Back',
		skip: 'Skip',
		finish: 'Done',
		showMe: 'Show me',
		sampleYes: 'With sample project',
		sampleNo: 'Without sample',
		sampleHint:
			'If you like, the tour creates a small sample room to play with. You can delete it afterwards.',
		sampleName: 'Example: Living room',
		sampleRoom: 'Living room',
		sampleFailed: 'The sample project could not be created. The tour continues without it.',
		sampleKept: 'The sample project stays in your list.',
		sampleDelete: 'Delete',
		shortcutsAction: 'Shortcuts',
		settingsAction: 'Settings',
		title_welcome: 'Welcome to RoomX',
		text_welcome:
			'Measure rooms, rebuild them in 3D and furnish them with an AI assistant. Everything stays local on this device.',
		title_projects: 'Your projects',
		text_projects:
			'The plus creates a new project. The card shows the preview image, and the menu (…) renames, backs up or deletes.',
		title_plan: 'The plan',
		text_plan:
			'Tap the plus to add a room and drag it into place. Tapping selects, double-tapping focuses, and you zoom with two fingers or the mouse wheel.',
		title_dims: 'Enter the dimensions',
		text_dims:
			'Enter length, width and height or pick a template, “Free” is for odd shapes. Drag corners right on the plan and set roof slopes in the panel.',
		title_elements: 'Doors, windows, sockets',
		text_elements:
			'Pick an element in the palette, tap a wall and drag it into place. The wall view shows heights exactly, the electrical layer reveals sockets.',
		title_photos: 'Photos per room',
		text_photos:
			'The guided photo tour takes you through the room wall by wall, so no angle is missing later.',
		title_build: 'Build 3D',
		text_build:
			'“Build 3D” checks your plan and builds the room in 3D. There you switch wall modes, walk through the room and turn the lights on or off.',
		title_furnish: 'Furnish',
		text_furnish:
			'Drag furniture from the catalogue into the room, rotate and stack it. Red marks warn about space problems, variants, budget, shopping list and needs are right next to it.',
		title_package: 'The AI package',
		text_package:
			'The AI package bundles PDF and room data. Upload the files to a chat with an AI assistant, paste the prompt (“Copy prompt”) and bring its plan back with “Import plan”.',
		title_safe: 'Backup and sync',
		title_safe_local: 'Backup',
		text_safe:
			'Everything is saved automatically and a backup (ZIP) can be restored at any time. Optionally sync with a server in the settings, and undo, redo and “?” are always at hand.',
		text_safe_local:
			'Everything is saved automatically on this device. A backup (ZIP) restores a project at any time or takes it to another device.',
		text_safe_phone:
			'Everything is saved automatically and a backup (ZIP) can be restored at any time. Optionally sync with a server in the settings, and undo and redo are always at hand.'
	}
});
