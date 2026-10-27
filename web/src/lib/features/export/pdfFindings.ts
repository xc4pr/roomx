import { checkRoomItems, type ItemIssueCode } from '#lib/core/checks.ts';
import type { Item, Room, RoomElement } from '#lib/core/schema.ts';
import { elementKindNames } from '#lib/i18n/common.ts';
import type { PdfContext } from './pdfKit.ts';
import { symbolTranslator } from './pdfText.ts';

const KEYS = {
	fireZone: 'findFire',
	airflowBlocked: 'findAir',
	elementCollision: 'findCollision'
} as const;

export function findingLines(
	ctx: PdfContext,
	room: Room,
	items: readonly Item[],
	suggestions: readonly RoomElement[]
): string[] {
	const tr = symbolTranslator(ctx.language);
	const all = [...room.elements, ...suggestions];
	const label = (id: string | undefined): string => {
		const element = all.find((candidate) => candidate.id === id);
		return element ? elementKindNames[ctx.language][element.kind] : '';
	};
	const lines: string[] = [];
	for (const issue of checkRoomItems(room, items, suggestions)) {
		const code: ItemIssueCode = issue.code;
		if (!(code in KEYS)) continue;
		const key = KEYS[code as keyof typeof KEYS];
		for (const id of issue.itemIds) {
			const index = items.findIndex((item) => item.id === id);
			if (index < 0) continue;
			lines.push(
				tr(key, { item: `${index + 1} ${items[index].name}`, element: label(issue.elementId) })
			);
		}
	}
	return lines;
}
