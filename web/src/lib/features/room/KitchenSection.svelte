<script lang="ts">
	import { hasKitchen } from '#lib/core/elements.ts';
	import type { Room } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { messages } from './i18n.ts';

	let { room }: { room: Room } = $props();

	const mode = $derived(room.kitchen?.mode ?? 'builtin');
	const canBeOpen = $derived(room.type === 'living' || room.type === 'dining');

	function setOpen(open: boolean): void {
		store.updateRoom(room.id, { kitchen: { ...room.kitchen, open } });
	}

	function setMode(next: 'builtin' | 'catalog'): void {
		store.updateRoom(room.id, { kitchen: { ...room.kitchen, mode: next } });
	}
</script>

{#if canBeOpen || hasKitchen(room)}
	<div class="flex flex-col gap-3" data-testid="kitchen-section">
		{#if canBeOpen}
			<Switch
				checked={room.kitchen?.open === true}
				label={t(messages, 'openKitchen')}
				description={t(messages, 'openKitchenHint')}
				onchange={setOpen}
			/>
		{/if}
		{#if hasKitchen(room)}
			<SegmentedControl
				full
				label={t(messages, 'kitchenMode')}
				items={[
					{ value: 'builtin', label: t(messages, 'kitchenBuiltin') },
					{ value: 'catalog', label: t(messages, 'kitchenCatalog') }
				]}
				value={mode}
				onchange={(value) => setMode(value as 'builtin' | 'catalog')}
			/>
			<p class="px-1 text-sm text-muted">
				{mode === 'catalog' ? t(messages, 'kitchenCatalogHint') : t(messages, 'kitchenBuiltinHint')}
			</p>
		{/if}
	</div>
{/if}
