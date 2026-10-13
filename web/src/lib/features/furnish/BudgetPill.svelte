<script lang="ts">
	import Wallet from '@lucide/svelte/icons/wallet';
	import { lookup } from '#lib/catalog/index.ts';
	import { formatChf } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { budgetState, variantTotal } from './budget.ts';
	import { messages } from './i18n.ts';
	import { openPanel } from './session.svelte.ts';

	let { class: extra = '' }: { class?: string } = $props();

	const total = $derived(variantTotal(store.activeVariant?.items ?? [], lookup));
	const state = $derived(budgetState(total.sum, store.project?.brief?.budgetChf));

	function money(value: number): string {
		return formatChf(value, locale.language);
	}
</script>

<button
	type="button"
	class="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border px-3 py-1.5 text-start transition duration-(--duration-base) ease-soft active:scale-[0.98] {state.over
		? 'border-danger bg-danger-soft'
		: 'border-border bg-surface hover:bg-surface-2'} {extra}"
	onclick={() => openPanel(state.budget === undefined && total.count === 0 ? 'brief' : 'list')}
	data-testid="budget-pill"
	aria-label={t(messages, 'budgetLabel')}
>
	<span
		class="flex size-8 shrink-0 items-center justify-center rounded-full {state.over
			? 'bg-danger text-accent-contrast'
			: 'bg-accent-soft text-accent'}"
	>
		<Wallet class="size-4.5" />
	</span>
	<span class="flex min-w-0 grow flex-col gap-1">
		<span class="flex items-baseline justify-between gap-2">
			<span
				class="shrink-0 text-[15px] leading-none font-black tabular-nums {state.over
					? 'text-danger'
					: ''}"
				data-testid="budget-sum"
			>
				{total.estimated ? `${t(messages, 'approx')} ` : ''}{money(total.sum)}
			</span>
			<span
				class="min-w-0 truncate text-xs font-semibold {state.over ? 'text-danger' : 'text-muted'}"
			>
				{#if state.budget === undefined}
					{t(messages, 'noBudget')}
				{:else if state.over}
					{t(messages, 'overBudgetShort', { amount: money(Math.abs(state.remaining ?? 0)) })}
				{:else}
					{t(messages, 'ofBudget', { budget: money(state.budget) })}
				{/if}
			</span>
		</span>
		<span class="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
			<span
				class="block h-full rounded-full transition-[width] duration-(--duration-slow) ease-soft {state.over
					? 'bg-danger'
					: state.ratio > 0.85
						? 'bg-warning'
						: 'bg-accent'}"
				style="width: {state.budget === undefined ? 0 : Math.max(2, state.ratio * 100)}%"
			></span>
		</span>
	</span>
</button>
