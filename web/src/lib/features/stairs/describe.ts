import { stairContext, type StairIssue } from '#lib/core/floors.ts';
import type { Project } from '#lib/core/schema.ts';
import { formatLength } from '#lib/core/units.ts';
import { locale, t } from '#lib/i18n/index.svelte.ts';
import { settings } from '#lib/state/settings.svelte.ts';
import { messages } from './i18n.ts';

export function describeStairIssue(
	project: Pick<Project, 'rooms' | 'floors' | 'stairs'>,
	issue: StairIssue
): string {
	const stair = project.stairs?.find((candidate) => candidate.id === issue.stairId);
	if (!stair) return t(messages, 'warnStairFallback');
	const context = stairContext(project, stair);
	const from = context?.from.name ?? project.floors?.find((f) => f.id === stair.fromFloorId)?.name;
	const to = context?.to.name ?? '';
	if (issue.code === 'stairNoUpperFloor') {
		return t(messages, 'warnNoUpper', { from: from ?? '' });
	}
	if (issue.code === 'stairHeadroom') {
		return t(messages, 'warnHeadroom', {
			from: from ?? '',
			to,
			tread: issue.tread ?? 0,
			height: formatLength(issue.headroom ?? 0, settings.unit, locale.language)
		});
	}
	return t(messages, 'warnOutside', { from: from ?? '', to });
}
