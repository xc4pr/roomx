<script lang="ts">
	import { untrack } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { fullCatalog } from '#lib/catalog/full.svelte.ts';
	import { allEntries } from '#lib/catalog/index.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
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
	import {
		brandsOf,
		categoriesOf,
		collapsedCategories,
		filterCatalog,
		kitchenFromCatalog,
		orderCategories,
		outdoorFromRoom,
		WIDTH_CLASSES,
		type WidthClass
	} from './filter.ts';
	import { messages } from './i18n.ts';
	import { pricesAsOf } from './priceDate.ts';
	import { session } from './session.svelte.ts';
	import VirtualGrid from './VirtualGrid.svelte';

	interface Props {
		onadd: (entry: CatalogEntry) => void;
		ondrop: (entry: CatalogEntry, x: number, y: number, over: 'board' | 'viewer' | null) => void;
	}

	let { onadd, ondrop }: Props = $props();

	const SEARCH_DELAY = 140;
	const CARD_HEIGHT = 292;

	let query = $state('');
	let applied = $state('');
	let category = $state<ItemCategory | 'all'>('all');
	let brand = $state('all');
	let width = $state('all');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const next = query;
		clearTimeout(timer);
		if (next === untrack(() => applied)) return;
		timer = setTimeout(() => (applied = next), next === '' ? 0 : SEARCH_DELAY);
		return () => clearTimeout(timer);
	});

	const entries = $derived.by(() => {
		void fullCatalog.count;
		return allEntries();
	});
	const counts = $derived(categoriesOf(entries));
	const room = $derived(ui.selectedRoomId ? store.room(ui.selectedRoomId) : undefined);
	const outdoorFirst = $derived(outdoorFromRoom(room));
	const kitchenFirst = $derived(kitchenFromCatalog(room));
	const categories = $derived(
		orderCategories(
			[...counts.keys()].sort((a, b) =>
				categoryNames[locale.language][a].localeCompare(
					categoryNames[locale.language][b],
					locale.language
				)
			),
			kitchenFirst
		)
	);
	const collapsed = $derived(
		collapsedCategories(categories, category, undefined, kitchenFirst ? 'kitchen' : undefined)
	);
	const shownCategories = $derived(session.categoriesOpen ? categories : collapsed);
	const hiddenCount = $derived(categories.length - collapsed.length);

	$effect(() => {
		void room?.id;
		if (kitchenFirst) category = 'kitchen';
	});
	const brands = $derived(brandsOf(entries));
	const brandOptions = $derived([
		{ value: 'all', label: t(messages, 'allBrands') },
		...brands.map((name) => ({
			value: name,
			label: name === 'Generic' ? t(messages, 'generic') : name
		}))
	]);
	const widthOptions = $derived([
		{ value: 'all', label: t(messages, 'anyWidth') },
		...WIDTH_CLASSES.map((value) => ({ value, label: t(messages, `width_${value}`) }))
	]);
	const results = $derived(
		filterCatalog(
			entries,
			{ query: applied, category, brand, width: width as WidthClass | 'all', outdoorFirst },
			locale.language
		)
	);
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

	<div class="flex flex-wrap gap-2 py-0.5" role="group" aria-label={t(messages, 'categories')}>
		<Chip selected={category === 'all'} onclick={() => (category = 'all')}>
			{t(messages, 'all')}
		</Chip>
		{#each shownCategories as name (name)}
			<Chip selected={category === name} onclick={() => (category = name)}>
				{t(categoryNames, name)}
			</Chip>
		{/each}
		{#if session.categoriesOpen}
			<Chip onclick={() => (session.categoriesOpen = false)} data-testid="categories-less">
				{t(messages, 'fewerCategories')}
			</Chip>
		{:else if hiddenCount > 0}
			<Chip onclick={() => (session.categoriesOpen = true)} data-testid="categories-more">
				{t(messages, 'moreCategories', { n: hiddenCount })}
			</Chip>
		{/if}
	</div>

	<div class="flex flex-wrap items-end gap-2">
		<Select
			class="min-w-36 flex-1 basis-36"
			options={brandOptions}
			bind:value={brand}
			label={t(messages, 'brand')}
		/>
		<Select
			class="min-w-36 flex-1 basis-36"
			options={widthOptions}
			bind:value={width}
			label={t(messages, 'widthFilter')}
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
		<VirtualGrid items={results} rowHeight={CARD_HEIGHT} minColumn={150} gap={8}>
			{#snippet row(entry)}
				<CatalogCard {entry} {onadd} {ondrop} />
			{/snippet}
		</VirtualGrid>
		<p class="px-1 text-xs text-muted pointer-coarse:text-sm" data-testid="catalog-note">
			{t(messages, 'catalogNote', { date: pricesAsOf() })}
		</p>
	{/if}
</div>
