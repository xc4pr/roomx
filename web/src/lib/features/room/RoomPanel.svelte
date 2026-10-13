<script lang="ts">
	import { ROOM_TYPES } from '#lib/core/schema.ts';
	import ElementsPanel from '#lib/features/elements/ElementsPanel.svelte';
	import PhotosPanel from '#lib/features/photos/PhotosPanel.svelte';
	import { roomTypeNames } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui, type PanelTab } from '#lib/state/ui.svelte.ts';
	import Chip from '#lib/ui/Chip.svelte';
	import Tabs from '#lib/ui/Tabs.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { setRoomType } from './actions.ts';
	import DimsTab from './DimsTab.svelte';
	import { fresh } from './fresh.svelte.ts';
	import { messages } from './i18n.ts';

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

	$effect(() => {
		void roomId;
		void room?.type;
		requestAnimationFrame(() => {
			if (document.querySelector('[role="menu"]')) return;
			const row = document.querySelector<HTMLElement>('[data-type-row]');
			const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
			if (!row || !chip) return;
			const left = chip.offsetLeft - row.offsetLeft;
			if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
				row.scrollTo({ left: left - 24, behavior: 'smooth' });
			}
		});
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
			class="-mx-5 no-scrollbar flex gap-2 overflow-x-auto px-5 py-0.5"
			role="group"
			aria-label={t(messages, 'roomType')}
		>
			{#each ROOM_TYPES as type (type)}
				<Chip
					selected={room.type === type}
					onclick={() => setRoomType(roomId, type)}
					data-testid="room-type-{type}"
				>
					{t(roomTypeNames, type)}
				</Chip>
			{/each}
		</div>

		<Tabs
			items={tabs}
			value={ui.panelTab}
			label={t(messages, 'tabsLabel')}
			onchange={(value) => (ui.panelTab = value as PanelTab)}
		/>

		{#if ui.panelTab === 'elements'}
			<ElementsPanel {roomId} />
		{:else if ui.panelTab === 'photos'}
			<PhotosPanel {roomId} />
		{:else}
			<DimsTab {room} />
		{/if}
	</div>
{/if}
