import type { Language } from '#lib/core/units.ts';
import type { LegalBlock, LegalDocument, LegalEdition } from './content.ts';

export type Segment =
	| { kind: 'text'; text: string }
	| { kind: 'bold'; text: string }
	| { kind: 'link'; text: string; href: string; external: boolean };

export interface VisibleSection {
	anchor: string;
	number: number;
	title: string;
	blocks: LegalBlock[];
}

export interface VisiblePart {
	id: string;
	title: string;
	intro: string;
	sections: VisibleSection[];
}

export interface VisibleDocument {
	updated: string;
	summary: string;
	lead: LegalBlock[];
	parts: VisiblePart[];
}

const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function parseInline(text: string): Segment[] {
	const segments: Segment[] = [];
	let last = 0;
	for (const match of text.matchAll(TOKEN)) {
		if (match.index > last) segments.push({ kind: 'text', text: text.slice(last, match.index) });
		const [whole, label, href, bold] = match;
		if (bold !== undefined) {
			segments.push({ kind: 'bold', text: bold });
		} else if (label !== undefined && href !== undefined) {
			segments.push({ kind: 'link', text: label, href, external: /^https?:\/\//.test(href) });
		}
		last = match.index + whole.length;
	}
	if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
	return segments;
}

export function currentEdition(localOnly: boolean): LegalEdition {
	return localOnly ? 'public' : 'selfHosted';
}

function shows(edition: LegalEdition | undefined, current: LegalEdition): boolean {
	return edition === undefined || edition === current;
}

export function visibleDocument(document: LegalDocument, edition: LegalEdition): VisibleDocument {
	return {
		updated: document.updated,
		summary: document.summary,
		lead: document.lead.filter((block) => shows(block.edition, edition)),
		parts: document.parts.map((part) => ({
			id: part.id,
			title: part.title,
			intro: part.intro,
			sections: part.sections
				.filter((section) => shows(section.edition, edition))
				.map((section, index) => ({
					anchor: `${part.id}-${section.id}`,
					number: index + 1,
					title: section.title,
					blocks: section.blocks.filter((block) => shows(block.edition, edition))
				}))
		}))
	};
}

export function formatUpdated(iso: string, language: Language): string {
	return new Intl.DateTimeFormat(language === 'de' ? 'de-CH' : 'en-CH', {
		dateStyle: 'long',
		timeZone: 'UTC'
	}).format(new Date(`${iso}T00:00:00Z`));
}
