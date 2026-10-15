<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { catalog } from '#lib/catalog/index.ts';
	import type { CatalogEntry } from '#lib/core/catalog.ts';
	import type { ItemCategory } from '#lib/core/schema.ts';
	import { categoryNames } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import CatalogCard from './CatalogCard.svelte';
	import { brandsOf, categoriesOf, filterCatalog } from './filter.ts';
	import { messages } from './i18n.ts';
	import { session } from './session.svelte.ts';

	interface Props {
		onadd: (entry: CatalogEntry) => void;
		ondrop: (entry: CatalogEntry, x: number, y: number, over: 'board' | 'viewer' | null) => void;
	}

	let { onadd, ondrop }: Props = $props();

	let query = $state('');
	let category = $state<ItemCategory | 'all'>('all');
	let brand = $state('all');

	const counts = categoriesOf(catalog);
	const categories = $derived(
		[...counts.keys()].sort((a, b) =>
			categoryNames[locale.language][a].localeCompare(
				categoryNames[locale.language][b],
				locale.language
			)
		)
	);
	const brands = brandsOf(catalog);
	const brandOptions = $derived([
		{ value: 'all', label: t(messages, 'allBrands') },
		...brands.map((name) => ({
			value: name,
			label: name === 'Generic' ? t(messages, 'generic') : name
		}))
	]);
	const results = $derived(filterCatalog(catalog, { query, category, brand }, locale.language));
</script>

<div class="flex flex-col gap-3" data-testid="catalog-panel">
	<TextField
		type="search"
		bind:value={query}
		label={t(messages, 'search')}
		placeholder={t(messages, 'searchPlaceholder')}
		autocomplete="off"
		class="[&>label]:sr-only"
		data-testid="catalog-search"
	>
		{#snippet trailing()}
			<Search class="size-5 text-muted" />
		{/snippet}
	</TextField>

	<div
		class="-mx-5 no-scrollbar flex gap-2 overflow-x-auto px-5 py-0.5"
		role="group"
		aria-label={t(messages, 'categories')}
	>
		<Chip selected={category === 'all'} onclick={() => (category = 'all')}>
			{t(messages, 'all')}
		</Chip>
		{#each categories as name (name)}
			<Chip selected={category === name} onclick={() => (category = name)}>
				{t(categoryNames, name)}
			</Chip>
		{/each}
	</div>

	<div class="flex items-end gap-2">
		<Select
			class="min-w-0 flex-1"
			options={brandOptions}
			bind:value={brand}
			label={t(messages, 'brand')}
		/>
		<Button
			variant="secondary"
			icon={Plus}
			onclick={() => (session.customOpen = true)}
			data-testid="custom-item"
		>
			{t(messages, 'customItem')}
		</Button>
	</div>

	{#if results.length === 0}
		<EmptyState title={t(messages, 'noResults')} description={t(messages, 'noResultsText')} />
	{:else}
		<p class="text-xs text-muted pointer-coarse:text-sm" aria-live="polite">
			{t(messages, results.length === 1 ? 'resultCountOne' : 'resultCount', { n: results.length })} ·
			{t(messages, 'dragHint')}
		</p>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
			{#each results as entry (entry.id)}
				<CatalogCard {entry} {onadd} {ondrop} />
			{/each}
		</div>
	{/if}
</div>
