<script lang="ts">
	import ElementsPanel from '#lib/features/elements/ElementsPanel.svelte';
	import PhotosPanel from '#lib/features/photos/PhotosPanel.svelte';
	import { roomTypeNames } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui, type PanelTab } from '#lib/state/ui.svelte.ts';
	import Chip from '#lib/ui/Chip.svelte';
	import Tabs from '#lib/ui/Tabs.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import FloorSection from './FloorSection.svelte';
	import DimsTab from './DimsTab.svelte';
	import { fresh } from './fresh.svelte.ts';
	import { messages } from './i18n.ts';
	import KitchenSection from './KitchenSection.svelte';
	import { changeType, selectableTypes } from './roomType.ts';

	let { roomId }: { roomId: string } = $props();

	const uid = $props.id();
	const nameId = `room-name-${uid}`;
	const room = $derived(store.room(roomId));

	$effect(() => {
		if (fresh.roomId !== roomId || !room) return;
		if (!matchMedia('(pointer: coarse)').matches) {
			const input = document.getElementById(nameId) as HTMLInputElement | null;
			input?.focus();
			input?.select();
		}
		const timer = setTimeout(() => {
			if (fresh.roomId === roomId) fresh.roomId = null;
		}, 600);
		return () => clearTimeout(timer);
	});

	const tabs = $derived([
		{ value: 'dims', label: t(messages, 'tabDims') },
		{
			value: 'elements',
			label: t(messages, 'tabElements'),
			badge: room && room.elements.length > 0 ? room.elements.length : undefined
		},
		{
			value: 'photos',
			label: t(messages, 'tabPhotos'),
			badge: room && room.photos.length > 0 ? room.photos.length : undefined
		}
	]);
</script>

{#if room}
	<div class="grid grid-cols-[minmax(0,1fr)] gap-4 pb-2">
		<div class="sticky -top-1 z-10 -mx-5 -mt-1 bg-surface px-5 pt-2">
			<Tabs
				items={tabs}
				value={ui.panelTab}
				label={t(messages, 'tabsLabel')}
				onchange={(value) => (ui.panelTab = value as PanelTab)}
			/>
		</div>

		{#if ui.panelTab === 'dims'}
			<TextField
				id={nameId}
				label={t(messages, 'name')}
				placeholder={t(messages, 'namePlaceholder')}
				value={room.name}
				maxlength={60}
				oninput={(name) => store.updateRoom(roomId, { name }, { coalesce: `name-${roomId}` })}
				onchange={() => store.sealHistory()}
				onenter={() => (document.activeElement as HTMLElement | null)?.blur()}
				data-testid="room-name"
			/>

			<div
				data-type-row
				class="flex flex-wrap gap-2 py-0.5"
				role="group"
				aria-label={t(messages, 'roomType')}
			>
				{#each selectableTypes(room.type) as type (type)}
					<Chip
						selected={room.type === type}
						onclick={() => changeType(roomId, type)}
						data-testid="room-type-{type}"
					>
						{t(roomTypeNames, type)}
					</Chip>
				{/each}
			</div>

			<FloorSection {room} />

			<KitchenSection {room} />
		{/if}

		{#if ui.panelTab === 'elements'}
			<ElementsPanel {roomId} />
		{:else if ui.panelTab === 'photos'}
			<PhotosPanel {roomId} />
		{:else}
			<DimsTab {room} />
		{/if}
	</div>
{/if}
