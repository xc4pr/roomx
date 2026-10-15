import type { Language } from '#lib/core/units.ts';
import { translator, type Translate } from '#lib/features/export/text.ts';
import { LIMITS } from '#lib/security/limits.ts';
import type { Analysis } from './analyze.ts';
import type { ImportKey } from './errors.ts';
import { messages } from './i18n.ts';
import type { PreviewVariant } from './preview.ts';

const MAX_LINES = 2 * LIMITS.reportedIssues;

interface Section {
	title: string;
	lines: string[];
}

function bullet(line: string): string {
	return `- ${line}`;
}

function namesRef(where: string, ref: string): boolean {
	const last = where.split(' › ').at(-1) ?? '';
	return last === ref || last.startsWith(`${ref} (`);
}

function planSections(variants: PreviewVariant[], tr: Translate<ImportKey>): Section[] {
	const skipped: string[] = [];
	const conflicts: string[] = [];
	const notes: string[] = [];
	for (const variant of variants) {
		const variantLabel = tr('pathVariant', { n: variant.index + 1 });
		for (const issue of variant.issues) {
			if (issue.severity === 'info') continue;
			const ref = issue.ref && !namesRef(issue.where, issue.ref) ? ` [${issue.ref}]` : '';
			(issue.severity === 'error' ? skipped : notes).push(`${issue.where}${ref}: ${issue.message}`);
		}
		for (const room of variant.rooms) {
			for (const conflict of room.errors) {
				conflicts.push(`${variantLabel} › ${room.name}: ${conflict.text}`);
			}
			for (const conflict of room.warnings) {
				notes.push(`${variantLabel} › ${room.name}: ${conflict.text}`);
			}
		}
	}
	return [
		{ title: tr('skippedTitle'), lines: skipped },
		{ title: tr('conflictsTitle'), lines: conflicts },
		{ title: tr('warningsTitle'), lines: notes }
	];
}

function sectionsFor(analysis: Analysis, tr: Translate<ImportKey>): Section[] {
	switch (analysis.status) {
		case 'invalid':
			return [{ title: tr('fixInvalid'), lines: analysis.errors }];
		case 'unreadable': {
			if (analysis.reason === 'noJson') return [];
			const key =
				analysis.reason === 'broken'
					? 'fixBroken'
					: analysis.reason === 'truncated'
						? 'fixTruncated'
						: 'fixTooLarge';
			return [{ title: tr(key), lines: [] }];
		}
		case 'ready':
			return planSections(analysis.preview, tr);
		default:
			return [];
	}
}

export function correctionText(analysis: Analysis, language: Language): string | undefined {
	const tr = translator(messages, language);
	const sections = sectionsFor(analysis, tr).filter(
		(section) => section.lines.length > 0 || analysis.status === 'unreadable'
	);
	if (sections.length === 0) return undefined;
	const out = [tr('fixIntro'), ''];
	let budget = MAX_LINES;
	let hidden = 0;
	for (const section of sections) {
		out.push(
			section.title.endsWith(':') || section.lines.length === 0
				? section.title
				: `${section.title}:`
		);
		const shown = section.lines.slice(0, Math.max(0, budget));
		budget -= shown.length;
		hidden += section.lines.length - shown.length;
		out.push(...shown.map(bullet), '');
	}
	if (hidden > 0) out.push(bullet(tr('fixMore', { n: hidden })), '');
	out.push(tr('fixOutro'));
	return out.join('\n');
}
