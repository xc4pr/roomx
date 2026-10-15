<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import { lookup } from '#lib/catalog/index.ts';
	import { formatChf } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import { itemLabel } from './actions.ts';
	import { budgetState, variantTotal } from './budget.ts';
	import { downloadText, safeFilename } from './download.ts';
	import { safeUrl } from './format.ts';
	import { messages } from './i18n.ts';
	import { groupShopping, planRows, shoppingCsv, type ShoppingRow } from './shopping.ts';

	const variant = $derived(store.activeVariant);
	const items = $derived(variant?.items ?? []);
	const rows = $derived(groupShopping(items, lookup, itemLabel));
	const plan = $derived(planRows(variant?.shoppingList ?? [], lookup));
	const total = $derived(variantTotal(items, lookup));
	const state = $derived(budgetState(total.sum, store.project?.brief?.budgetChf));

	function money(value: number): string {
		return formatChf(value, locale.language);
	}

	function exportCsv(): void {
		const csv = shoppingCsv(rows, plan, {
			name: t(messages, 'csv_name'),
			brand: t(messages, 'csv_brand'),
			qty: t(messages, 'csv_qty'),
			unitPrice: t(messages, 'csv_unitPrice'),
			total: t(messages, 'csv_total'),
			estimate: t(messages, 'csv_estimate'),
			link: t(messages, 'csv_link'),
			sum: t(messages, 'csv_sum'),
			plan: t(messages, 'csv_plan'),
			yes: t(messages, 'csv_yes')
		});
		const base = safeFilename(`${store.project?.name ?? 'roomx'}-${variant?.name ?? 'A'}`);
		downloadText(`${base}-${t(messages, 'csv_file')}.csv`, csv);
	}
</script>

{#snippet row(entry: ShoppingRow)}
	{@const href = safeUrl(entry.url)}
	<li class="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<div class="flex items-center gap-1.5">
				{#each entry.colors.slice(0, 4) as swatch (swatch)}
					<span
						class="size-3 shrink-0 rounded-full border border-border"
						style="background: {swatch}"
					></span>
				{/each}
				<span class="min-w-0 truncate text-sm font-semibold">{entry.name}</span>
			</div>
			<p class="text-xs text-muted tabular-nums pointer-coarse:text-sm">
				{entry.qty} ×
				{entry.unitPrice === undefined ? t(messages, 'priceOpen') : money(entry.unitPrice)}
				{#if entry.brand}· {entry.brand}{/if}
			</p>
			{#if entry.estimated}
				<p class="text-xs font-semibold text-warning pointer-coarse:text-sm">
					{t(messages, 'estimateBadge')}
				</p>
			{/if}
		</div>
		<div class="flex shrink-0 flex-col items-end gap-1">
			<span class="text-sm font-bold tabular-nums">
				{entry.estimated ? `${t(messages, 'approx')} ` : ''}{money(entry.total)}
			</span>
			{#if href}
				<a
					{href}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-accent pointer-coarse:text-sm"
				>
					{t(messages, 'open')}
					<ExternalLink class="size-3.5" />
				</a>
			{/if}
		</div>
	</li>
{/snippet}

{#if items.length === 0 && plan.length === 0}
	<EmptyState
		icon={ShoppingCart}
		title={t(messages, 'listEmptyTitle')}
		description={t(messages, 'listEmptyText')}
	/>
{:else}
	<div class="flex flex-col gap-4" data-testid="shopping-list">
		<div class="flex flex-col gap-2 rounded-lg bg-surface-2 p-4">
			<p class="text-xs font-semibold tracking-wide text-muted uppercase pointer-coarse:text-sm">
				{t(messages, 'variantTotal', { name: variant?.name ?? 'A' })}
			</p>
			<p class="text-3xl font-black tracking-tight tabular-nums" data-testid="list-total">
				{total.estimated ? `${t(messages, 'approx')} ` : ''}{money(total.sum)}
			</p>
			{#if state.budget !== undefined}
				<p class="text-sm font-semibold {state.over ? 'text-danger' : 'text-muted'}">
					{state.over
						? t(messages, 'overBudget', { amount: money(Math.abs(state.remaining ?? 0)) })
						: t(messages, 'underBudget', { amount: money(state.remaining ?? 0) })}
				</p>
			{/if}
			{#if total.unpriced > 0}
				<p class="text-xs text-muted pointer-coarse:text-sm">
					{t(messages, total.unpriced === 1 ? 'unpricedOne' : 'unpriced', { n: total.unpriced })}
				</p>
			{/if}
		</div>

		{#if rows.length > 0}
			<ul class="flex flex-col gap-2">
				{#each rows as entry (entry.key)}
					{@render row(entry)}
				{/each}
			</ul>
		{/if}

		{#if plan.length > 0}
			<section class="flex flex-col gap-2">
				<h3 class="text-sm font-bold">{t(messages, 'planList')}</h3>
				<p class="text-xs text-muted pointer-coarse:text-sm">{t(messages, 'planListHint')}</p>
				<ul class="flex flex-col gap-2">
					{#each plan as entry (entry.key)}
						{@render row(entry)}
					{/each}
				</ul>
			</section>
		{/if}

		<Button variant="primary" icon={Download} full onclick={exportCsv} data-testid="export-csv">
			{t(messages, 'exportCsv')}
		</Button>
	</div>
{/if}
