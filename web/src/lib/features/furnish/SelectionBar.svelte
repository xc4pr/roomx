<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Lock from '@lucide/svelte/icons/lock';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { deleteItem, duplicateItem, itemLabel, rotateItem, turnItem } from './actions.ts';
	import { messages } from './i18n.ts';
	import { openPanel } from './session.svelte.ts';

	let { compact = false, fine = false }: { compact?: boolean; fine?: boolean } = $props();

	const item = $derived(ui.selectedItemId ? store.item(ui.selectedItemId) : undefined);

	const fineClass =
		'inline-flex size-11 shrink-0 select-none flex-col items-center justify-center gap-0.5 rounded-full text-text transition duration-(--duration-fast) ease-soft hover:bg-surface-2 active:scale-90 disabled:pointer-events-none disabled:opacity-40';

	function toggleLock(): void {
		const id = item?.id;
		if (!id || !item) return;
		const next = !item.locked;
		store.mutate((project) => {
			const target = project.variants
				.find((variant) => variant.id === project.activeVariantId)
				?.items.find((candidate) => candidate.id === id);
			if (!target) return;
			if (next) target.locked = true;
			else delete target.locked;
		});
	}
</script>

{#if item}
	{#key item.id}
		<div
			class="pointer-events-auto flex max-w-full animate-rise-in flex-wrap items-center justify-center gap-0.5 rounded-3xl border border-border bg-surface/95 p-1 shadow-float backdrop-blur max-[420px]:gap-0 max-[420px]:p-0.5"
			role="toolbar"
			aria-label={t(messages, 'selectionBar')}
			data-testid="selection-bar"
		>
			{#if !compact}
				<span class="max-w-[16ch] truncate ps-3 pe-2 text-sm font-bold">{itemLabel(item)}</span>
			{/if}
			<IconButton
				icon={RotateCcw}
				label={t(messages, 'rotateLeft')}
				variant="ghost"
				disabled={item.locked}
				onclick={() => rotateItem(item.id, 90)}
				data-testid="sel-rotate-left"
			/>
			{#if fine}
				<button
					type="button"
					class={fineClass}
					aria-label={t(messages, 'rotateLeftFine')}
					title={t(messages, 'rotateLeftFine')}
					disabled={item.locked}
					onclick={() => turnItem(item.id, 1)}
					data-testid="sel-turn-left"
				>
					<RotateCcw class="size-3.5" />
					<span class="text-[11px] leading-none font-bold">15°</span>
				</button>
				<button
					type="button"
					class={fineClass}
					aria-label={t(messages, 'rotateRightFine')}
					title={t(messages, 'rotateRightFine')}
					disabled={item.locked}
					onclick={() => turnItem(item.id, -1)}
					data-testid="sel-turn-right"
				>
					<RotateCw class="size-3.5" />
					<span class="text-[11px] leading-none font-bold">15°</span>
				</button>
			{/if}
			<IconButton
				icon={RotateCw}
				label={t(messages, 'rotateRight')}
				variant="ghost"
				disabled={item.locked}
				onclick={() => rotateItem(item.id, -90)}
				data-testid="sel-rotate-right"
			/>
			<IconButton
				icon={Copy}
				label={t(messages, 'duplicate')}
				variant="ghost"
				onclick={() => duplicateItem(item.id)}
			/>
			<IconButton
				icon={item.locked ? Lock : LockOpen}
				label={item.locked ? t(messages, 'unlock') : t(messages, 'lock')}
				variant="ghost"
				pressed={item.locked === true}
				onclick={toggleLock}
				data-testid="sel-lock"
			/>
			<IconButton
				icon={SlidersHorizontal}
				label={t(messages, 'details')}
				variant="ghost"
				class="max-[420px]:hidden"
				onclick={() => openPanel('item')}
				data-testid="sel-details"
			/>
			<IconButton
				icon={Trash2}
				label={t(messages, 'remove')}
				variant="ghost"
				onclick={() => deleteItem(item.id)}
				data-testid="sel-delete"
			/>
			<IconButton
				icon={X}
				label={t(messages, 'deselect')}
				variant="ghost"
				onclick={() => (ui.selectedItemId = null)}
			/>
		</div>
	{/key}
{/if}
