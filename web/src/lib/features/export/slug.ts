const TRANSLITERATION: Record<string, string> = {
	ä: 'ae',
	ö: 'oe',
	ü: 'ue',
	Ä: 'Ae',
	Ö: 'Oe',
	Ü: 'Ue',
	ß: 'ss',
	æ: 'ae',
	Æ: 'Ae',
	œ: 'oe',
	Œ: 'Oe',
	ø: 'o',
	Ø: 'O',
	ð: 'd',
	þ: 'th',
	ł: 'l',
	Ł: 'L',
	ı: 'i'
};

export function slugify(name: string, fallback = 'projekt'): string {
	const slug = name
		.replace(/[äöüÄÖÜßæÆœŒøØðþłŁı]/g, (char) => TRANSLITERATION[char] ?? char)
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
		.replace(/-+$/g, '');
	return slug || fallback;
}

export function dateStamp(date: Date = new Date()): string {
	const year = String(date.getFullYear()).padStart(4, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function exportFileName(
	projectName: string,
	extension: string,
	date: Date = new Date()
): string {
	return `roomx-${slugify(projectName)}-${dateStamp(date)}.${extension}`;
}
