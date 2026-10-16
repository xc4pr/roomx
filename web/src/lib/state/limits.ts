import { defineMessages, t } from '#lib/i18n/index.svelte.ts';
import { LIMITS, type CountLimit } from '#lib/security/limits.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';

export const messages = defineMessages({
	de: {
		rooms: 'Höchstens {n} Räume pro Projekt. Lösche einen Raum, um einen neuen anzulegen.',
		polygonPoints: 'Höchstens {n} Eckpunkte pro Raum.',
		elementsPerRoom: 'Höchstens {n} Elemente pro Raum. Lösche eines, um ein neues zu setzen.',
		photosPerRoom: 'Höchstens {n} Fotos pro Raum. Lösche ein Foto, um ein neues zu speichern.',
		variants: 'Höchstens {n} Varianten pro Projekt. Lösche eine Variante, um eine neue anzulegen.',
		itemsPerVariant: 'Höchstens {n} Möbel pro Variante. Entferne eines, um ein neues zu setzen.',
		suggestionsPerVariant: 'Höchstens {n} Vorschläge pro Variante.',
		shoppingEntries: 'Höchstens {n} Einträge in der Einkaufsliste einer Variante.',
		briefList: 'Höchstens {n} Einträge pro Liste im Bedarf. Entferne einen Eintrag zuerst.',
		briefKeep: 'Höchstens {n} Stücke, die bleiben sollen. Entferne zuerst eines.'
	},
	en: {
		rooms: 'At most {n} rooms per project. Delete a room to add a new one.',
		polygonPoints: 'At most {n} corners per room.',
		elementsPerRoom: 'At most {n} elements per room. Delete one to add a new one.',
		photosPerRoom: 'At most {n} photos per room. Delete a photo to save a new one.',
		variants: 'At most {n} variants per project. Delete a variant to add a new one.',
		itemsPerVariant: 'At most {n} pieces of furniture per variant. Remove one to add a new one.',
		suggestionsPerVariant: 'At most {n} suggestions per variant.',
		shoppingEntries: 'At most {n} shopping list entries per variant.',
		briefList: 'At most {n} entries per list in the brief. Remove one first.',
		briefKeep: 'At most {n} pieces to keep. Remove one first.'
	}
});

export function announceLimit(name: CountLimit): void {
	toasts.show({
		id: `limit-${name}`,
		message: t(messages, name, { n: LIMITS[name] }),
		kind: 'error'
	});
}
