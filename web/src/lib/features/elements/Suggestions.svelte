<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import X from '@lucide/svelte/icons/x';
	import { isWallElement, type RoomElement } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { elementKindNames } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import { messages } from './i18n.ts';
	import { KIND_ICONS, kindColor } from './kinds.ts';
	import { wallCorners } from './logic.ts';

	let { roomId }: { roomId: string } = $props();

	const room = $derived(store.room(roomId));
	const variant = $derived(store.activeVariant);
	const suggestions = $derived(
		(variant?.suggestions ?? [])
			.filter((suggestion) => suggestion.roomId === roomId)
			.map((suggestion) => suggestion.element)
	);

	function place(element: RoomElement): string {
		if (!room || !isWallElement(element)) return t(messages, 'ceiling');
		return t(messages, 'suggestionPlace', {
			wall: element.wall,
			corners: wallCorners(room.polygon, element.wall),
			distance: formatLength(element.offset, settings.unit, locale.language)
		});
	}

	function accept(element: RoomElement): void {
		if (variant) store.acceptSuggestion(variant.id, element.id);
	}

	function reject(element: RoomElement): void {
		if (variant) store.rejectSuggestion(variant.id, element.id);
		if (ui.selectedElementId === element.id) ui.selectedElementId = null;
	}

	function acceptAll(): void {
		const variantId = variant?.id;
		if (!variantId) return;
		store.mutate((project) => {
			const source = project.variants.find((candidate) => candidate.id === variantId);
			const target = project.rooms.find((candidate) => candidate.id === roomId);
			if (!source || !target) return;
			const mine = source.suggestions.filter((suggestion) => suggestion.roomId === roomId);
			for (const suggestion of mine) {
				target.elements.push({ ...suggestion.element, status: 'planned' });
			}
			source.suggestions = source.suggestions.filter((suggestion) => suggestion.roomId !== roomId);
		});
	}

	function select(element: RoomElement): void {
		ui.selectedElementId = element.id;
		ui.electricalLayer = true;
	}
</script>

{#if suggestions.length > 0}
	<section class="flex flex-col gap-2" data-testid="element-suggestions">
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-sm font-bold">
				{t(messages, 'suggestions', { n: suggestions.length })}
			</h3>
			{#if suggestions.length > 1}
				<Button size="sm" variant="secondary" icon={CheckCheck} onclick={acceptAll}>
					{t(messages, 'acceptAll')}
				</Button>
			{/if}
		</div>
		<ul class="flex flex-col gap-2">
			{#each suggestions as element (element.id)}
				{@const Icon = KIND_ICONS[element.kind]}
				<li
					class="flex flex-col gap-2 rounded-lg border bg-surface p-3 {ui.selectedElementId ===
					element.id
						? 'border-suggested'
						: 'border-border'}"
				>
					<button
						type="button"
						class="flex min-h-11 items-start gap-3 text-left"
						onclick={() => select(element)}
					>
						<span class="mt-0.5 shrink-0" style="color: {kindColor(element.kind)}">
							<Icon class="size-5" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block text-sm font-semibold">{t(elementKindNames, element.kind)}</span>
							<span class="block text-xs text-muted pointer-coarse:text-sm">{place(element)}</span>
							{#if element.reason}
								<span class="mt-1 block text-sm">{element.reason}</span>
							{/if}
						</span>
					</button>
					<div class="flex gap-2">
						<Button size="sm" variant="primary" icon={Check} onclick={() => accept(element)}>
							{t(messages, 'accept')}
						</Button>
						<Button size="sm" variant="ghost" icon={X} onclick={() => reject(element)}>
							{t(messages, 'reject')}
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
