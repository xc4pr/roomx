import type { CatalogLookup } from '#lib/core/catalog.ts';
import { PlanSchema, type Plan } from '#lib/core/plan.ts';
import { resolvePlan, type ResolvedPlan } from '#lib/core/planResolve.ts';
import type { Brief, Project, Variant } from '#lib/core/schema.ts';
import type { Language, LengthUnit } from '#lib/core/units.ts';
import type { IdFactory } from '#lib/core/ids.ts';
import { describeZodError } from './errors.ts';
import { extractPlan, type ExtractFailure } from './extract.ts';
import { buildPreview, type PreviewVariant } from './preview.ts';

export type Analysis =
	| { status: 'empty' }
	| { status: 'unreadable'; reason: Exclude<ExtractFailure, 'empty'> }
	| { status: 'invalid'; errors: string[] }
	| {
			status: 'ready';
			plan: Plan;
			resolved: ResolvedPlan;
			preview: PreviewVariant[];
			skipped: number;
	  };

export interface AnalyzeOptions {
	project: Project;
	lookup: CatalogLookup;
	language: Language;
	unit: LengthUnit;
	newId?: IdFactory;
}

export function analyzePlanText(text: string, options: AnalyzeOptions): Analysis {
	const extracted = extractPlan(text);
	if (!extracted.ok) {
		return extracted.reason === 'empty'
			? { status: 'empty' }
			: { status: 'unreadable', reason: extracted.reason };
	}
	const parsed = PlanSchema.safeParse(extracted.value);
	if (!parsed.success) {
		return {
			status: 'invalid',
			errors: describeZodError(parsed.error, extracted.value, {
				project: options.project,
				lookup: options.lookup,
				language: options.language
			})
		};
	}
	const resolved = resolvePlan(parsed.data, options.project, options.lookup, {
		language: options.language,
		newId: options.newId
	});
	const preview = buildPreview(parsed.data, resolved, options);
	return {
		status: 'ready',
		plan: parsed.data,
		resolved,
		preview,
		skipped: preview.reduce((sum, variant) => sum + variant.skipped, 0)
	};
}

export function importable(variant: Variant): boolean {
	return variant.items.length > 0 || variant.suggestions.length > 0;
}

export function pickVariants(
	resolved: ResolvedPlan,
	selected: ReadonlySet<number>,
	includeBrief: boolean
): { variants: Variant[]; brief?: Brief } {
	const variants = resolved.variants.filter((_, index) => selected.has(index));
	return { variants, ...(includeBrief && resolved.brief ? { brief: resolved.brief } : {}) };
}

export function briefDiffers(project: Project, brief: Brief | undefined): boolean {
	return brief !== undefined && JSON.stringify(brief) !== JSON.stringify(project.brief);
}
