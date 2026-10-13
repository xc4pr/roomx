import type { RoomType } from '#lib/core/schema.ts';

export interface TypeNames {
	de: Record<RoomType, string>;
	en: Record<RoomType, string>;
}

export function isAutoName(name: string, names: TypeNames): boolean {
	const trimmed = name.trim();
	if (trimmed === '') return true;
	if (/^(Raum|Room)(\s+\d+)?$/i.test(trimmed)) return true;
	const stripped = trimmed.replace(/\s+\d+$/, '');
	return [...Object.values(names.de), ...Object.values(names.en)].includes(stripped);
}

export function uniqueName(base: string, taken: readonly string[]): string {
	if (!taken.includes(base)) return base;
	let n = 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}
