import { describe, expect, it } from 'vitest';
import type { Language } from '#lib/core/units.ts';
import {
	GITHUB_PRIVACY_URL,
	SUPERVISORY_URL,
	legalContent,
	type LegalBlock,
	type LegalDocument,
	type LegalEdition
} from './content.ts';
import { messages } from './i18n.ts';
import { currentEdition, formatUpdated, parseInline, visibleDocument } from './logic.ts';
import {
	CONTACT_URL,
	COPYRIGHT_YEAR,
	OPERATOR_ADDRESS,
	OPERATOR_EMAIL,
	OPERATOR_NAME,
	PUBLIC_URL,
	REPOSITORY_URL,
	displayUrl
} from './operator.ts';

const LANGUAGES: Language[] = ['de', 'en'];
const EDITIONS: LegalEdition[] = ['public', 'selfHosted'];

const FORBIDDEN = [
	['Cla', 'ude'],
	['Anth', 'ropic'],
	['Chat', 'GPT'],
	['Open', 'AI'],
	['Gem', 'ini']
].map((parts) => parts.join(''));

function texts(block: LegalBlock): string[] {
	if (block.kind === 'licenses') return [];
	return block.kind === 'list' ? block.items : [block.text];
}

function allTexts(document: LegalDocument): string[] {
	return [
		document.summary,
		...document.lead.flatMap(texts),
		...document.parts.flatMap((part) => [
			part.title,
			part.intro,
			...part.sections.flatMap((section) => [section.title, ...section.blocks.flatMap(texts)])
		])
	];
}

function links(text: string): string[] {
	return parseInline(text).flatMap((segment) =>
		segment.kind === 'link'
			? [segment.href.replace('docs.github.com/de/', 'docs.github.com/en/')]
			: []
	);
}

function outline(document: LegalDocument): unknown {
	return {
		lead: document.lead.map((block) => [block.kind, block.edition]),
		parts: document.parts.map((part) => ({
			id: part.id,
			sections: part.sections.map((section) => ({
				id: section.id,
				edition: section.edition,
				blocks: section.blocks.map((block) => [
					block.kind,
					block.edition,
					block.kind === 'list' ? block.items.length : 1,
					texts(block).map(links)
				])
			}))
		}))
	};
}

describe('legal content', () => {
	it('has the same structure in German and English', () => {
		expect(outline(legalContent.en)).toEqual(outline(legalContent.de));
	});

	it('has the two parts with their anchors', () => {
		for (const language of LANGUAGES) {
			expect(legalContent[language].parts.map((part) => part.id)).toEqual([
				'datenschutz',
				'haftung',
				'lizenzen'
			]);
		}
	});

	it('carries the same valid update date in both languages', () => {
		expect(legalContent.de.updated).toBe(legalContent.en.updated);
		for (const language of LANGUAGES) {
			const { updated } = legalContent[language];
			expect(updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(Number.isNaN(new Date(updated).getTime())).toBe(false);
			expect(formatUpdated(updated, language)).toContain(updated.slice(0, 4));
		}
	});

	it('formats the date in the language of the reader', () => {
		expect(formatUpdated('2026-10-15', 'de')).toBe('15. Oktober 2026');
		expect(formatUpdated('2026-10-15', 'en')).toBe('15 October 2026');
	});

	it('has no empty text, section or list', () => {
		for (const language of LANGUAGES) {
			const document = legalContent[language];
			expect(document.lead.length, language).toBeGreaterThan(0);
			for (const part of document.parts) {
				expect(part.sections.length, `${language}.${part.id}`).toBeGreaterThan(0);
				for (const section of part.sections) {
					const where = `${language}.${part.id}.${section.id}`;
					expect(section.blocks.length, where).toBeGreaterThan(0);
					for (const block of section.blocks) {
						if (block.kind === 'list') expect(block.items.length, where).toBeGreaterThan(0);
					}
				}
			}
			for (const text of allTexts(document)) expect(text.trim(), language).not.toBe('');
		}
	});

	it('uses unique section ids', () => {
		for (const language of LANGUAGES) {
			for (const part of legalContent[language].parts) {
				const ids = part.sections.map((section) => section.id);
				expect(new Set(ids).size, `${language}.${part.id}`).toBe(ids.length);
			}
		}
	});

	it('uses Swiss spelling, no dashes as punctuation and no assistant names', () => {
		for (const language of LANGUAGES) {
			for (const text of allTexts(legalContent[language])) {
				expect(text.includes('ß'), text).toBe(false);
				expect(/[—–]/.test(text), text).toBe(false);
				for (const word of FORBIDDEN) {
					expect(text.toLowerCase().includes(word.toLowerCase()), `${language}: ${word}`).toBe(
						false
					);
				}
			}
		}
	});

	it('only links to the operator constants and the two public authorities', () => {
		const allowed = new Set([
			CONTACT_URL,
			REPOSITORY_URL,
			PUBLIC_URL,
			GITHUB_PRIVACY_URL.de,
			GITHUB_PRIVACY_URL.en,
			SUPERVISORY_URL,
			...(OPERATOR_EMAIL ? [`mailto:${OPERATOR_EMAIL}`] : [])
		]);
		for (const language of LANGUAGES) {
			for (const text of allTexts(legalContent[language])) {
				for (const href of links(text)) expect(allowed.has(href), href).toBe(true);
			}
		}
	});
});

describe('required statements', () => {
	function everything(language: Language): string {
		return allTexts(legalContent[language]).join('\n');
	}

	it('names the brands and the missing connection to the manufacturers', () => {
		for (const language of LANGUAGES) {
			const text = everything(language);
			for (const brand of ['IKEA', 'PAX', 'Tchibo', 'CN3']) expect(text, brand).toContain(brand);
		}
	});

	it('warns about electrical work, wall mounting and backups', () => {
		expect(everything('de')).toContain('NIV');
		expect(everything('de')).toContain('nur eine Skizze');
		expect(everything('de')).toContain('Kippsicherung');
		expect(everything('de')).toContain('Sicherungen sind deine Sache');
		expect(everything('en')).toContain('NIV');
		expect(everything('en')).toContain('only a sketch');
		expect(everything('en')).toContain('tip-over protection');
	});

	it('explains hosting, the transfer to the USA and local photo processing', () => {
		for (const language of LANGUAGES) {
			const text = everything(language);
			expect(text, language).toContain('GitHub Pages');
			expect(text, language).toContain('USA');
			expect(text, language).toContain(GITHUB_PRIVACY_URL[language]);
			expect(text, language).toContain('GPS');
		}
	});

	it('names the delete button of the settings', () => {
		expect(everything('de')).toContain('«Alle lokalen Daten löschen»');
		expect(everything('en')).toContain('“Delete all local data”');
	});

	it('carries the copyright notice with the operator constants and a licence list', () => {
		for (const language of LANGUAGES) {
			const part = legalContent[language].parts.find((candidate) => candidate.id === 'lizenzen')!;
			const text = part.sections.flatMap((section) => section.blocks.flatMap(texts)).join('\n');
			expect(text, language).toContain(`© ${COPYRIGHT_YEAR} ${OPERATOR_NAME}`);
			expect(
				part.sections.some((section) => section.blocks.some((block) => block.kind === 'licenses'))
			).toBe(true);
			expect(text, language).toContain('Figtree');
		}
		expect(everything('de')).toContain('alle Rechte vorbehalten');
		expect(everything('en')).toContain('all rights reserved');
	});
});

describe('operator constants', () => {
	function contact(language: Language): string[] {
		const section = legalContent[language].parts[0]!.sections.find(
			(candidate) => candidate.id === 'verantwortlich'
		)!;
		return section.blocks.flatMap(texts);
	}

	it('are used in the contact section of both languages', () => {
		for (const language of LANGUAGES) {
			const text = contact(language).join('\n');
			expect(text, language).toContain(OPERATOR_NAME);
			expect(text, language).toContain(CONTACT_URL);
			expect(text, language).toContain(REPOSITORY_URL);
			expect(text, language).toContain(PUBLIC_URL);
			if (OPERATOR_EMAIL) expect(text, language).toContain(OPERATOR_EMAIL);
			else expect(text, language).not.toContain('mailto:');
			if (OPERATOR_ADDRESS) expect(text, language).toContain(OPERATOR_ADDRESS);
		}
	});

	it('default to the GitHub contact only', () => {
		expect(OPERATOR_EMAIL).toBe('');
		expect(CONTACT_URL).toBe('https://github.com/xc4pr/roomx/issues');
	});

	it('shorten URLs for display', () => {
		expect(displayUrl('https://xc4pr.github.io/roomx/')).toBe('xc4pr.github.io/roomx');
		expect(displayUrl('https://github.com/xc4pr/roomx')).toBe('github.com/xc4pr/roomx');
	});
});

describe('visibleDocument', () => {
	function ids(document: LegalDocument, edition: LegalEdition): string[] {
		return visibleDocument(document, edition).parts.flatMap((part) =>
			part.sections.map((section) => section.anchor)
		);
	}

	it('maps the build switch to an edition', () => {
		expect(currentEdition(true)).toBe('public');
		expect(currentEdition(false)).toBe('selfHosted');
	});

	it('shows the hosting section only in the public version', () => {
		for (const language of LANGUAGES) {
			expect(ids(legalContent[language], 'public')).toContain('datenschutz-hosting');
			expect(ids(legalContent[language], 'public')).not.toContain('datenschutz-server');
		}
	});

	it('adds the sync server section only to the self-hosted version', () => {
		for (const language of LANGUAGES) {
			expect(ids(legalContent[language], 'selfHosted')).toContain('datenschutz-server');
			expect(ids(legalContent[language], 'selfHosted')).not.toContain('datenschutz-hosting');
		}
	});

	it('keeps every visible section filled and numbered from one', () => {
		for (const language of LANGUAGES) {
			for (const edition of EDITIONS) {
				const view = visibleDocument(legalContent[language], edition);
				expect(view.lead.length, `${language}.${edition}`).toBeGreaterThan(0);
				for (const part of view.parts) {
					expect(part.sections.map((section) => section.number)).toEqual(
						part.sections.map((_, index) => index + 1)
					);
					for (const section of part.sections) {
						expect(section.blocks.length, section.anchor).toBeGreaterThan(0);
					}
				}
			}
		}
	});
});

describe('parseInline', () => {
	it('splits text, bold and links', () => {
		expect(parseInline('a **b** [c](https://x.test/y) d')).toEqual([
			{ kind: 'text', text: 'a ' },
			{ kind: 'bold', text: 'b' },
			{ kind: 'text', text: ' ' },
			{ kind: 'link', text: 'c', href: 'https://x.test/y', external: true },
			{ kind: 'text', text: ' d' }
		]);
	});

	it('keeps plain text and marks mail links as internal', () => {
		expect(parseInline('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
		expect(parseInline('[m](mailto:a@b.ch)')).toEqual([
			{ kind: 'link', text: 'm', href: 'mailto:a@b.ch', external: false }
		]);
	});
});

describe('page messages', () => {
	it('exist in both languages', () => {
		expect(Object.keys(messages.de).sort()).toEqual(Object.keys(messages.en).sort());
	});
});
