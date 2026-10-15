<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { areaMm2, perimeter } from '#lib/core/geometry.ts';
	import type { Point, Room, RoomElement } from '#lib/core/schema.ts';
	import { formatArea, formatLength } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { untrack } from 'svelte';
	import { common } from '#lib/i18n/common.ts';
	import { deleteRoom, duplicateAndSelect } from './actions.ts';
	import AppearanceSection from './AppearanceSection.svelte';
	import FreeForm from './FreeForm.svelte';
	import { messages } from './i18n.ts';
	import NeighboursSection from './NeighboursSection.svelte';
	import RectForm from './RectForm.svelte';
	import SlopeSection from './SlopeSection.svelte';
	import TemplateForm from './TemplateForm.svelte';
	import { inferTemplate, isRectangle } from './templateInfo.ts';
	import { polygonKey } from './walls.ts';

	type Form = 'rect' | 'template' | 'free';

	let { room }: { room: Room } = $props();

	function detect(polygon: readonly Point[]): Form {
		if (isRectangle(polygon)) return 'rect';
		return inferTemplate(polygon) ? 'template' : 'free';
	}

	let form = $state<Form>(untrack(() => detect(room.polygon)));
	let lastRoom = untrack(() => room.id);
	let lastKey = untrack(() => polygonKey(room.polygon));
	let confirmDelete = $state(false);

	$effect(() => {
		const id = room.id;
		const key = polygonKey(room.polygon);
		if (id !== lastRoom) {
			lastRoom = id;
			lastKey = key;
			form = detect(room.polygon);
			return;
		}
		if (key === lastKey) return;
		lastKey = key;
		if (form === 'rect' && !isRectangle(room.polygon)) form = detect(room.polygon);
		else if (form === 'template' && !inferTemplate(room.polygon)) form = 'free';
	});

	const area = $derived(areaMm2(room.polygon));
	const around = $derived(perimeter(room.polygon));

	function apply(polygon: Point[]): void {
		lastKey = polygonKey(polygon);
		store.setPolygon(room.id, polygon, { coalesce: `dims-${room.id}` });
	}

	function restructure(polygon: Point[], elements: RoomElement[]): void {
		lastKey = polygonKey(polygon);
		store.mutate((project) => {
			const target = project.rooms.find((candidate) => candidate.id === room.id);
			if (!target) return;
			target.polygon = polygon;
			target.elements = elements;
		});
	}

	function seal(): void {
		store.sealHistory();
	}

	function switchForm(next: string): void {
		const target = next as Form;
		if (target === 'rect' && !isRectangle(room.polygon)) {
			const xs = room.polygon.map((p) => p.x);
			const ys = room.polygon.map((p) => p.y);
			const length = Math.max(...xs) - Math.min(...xs);
			const width = Math.max(...ys) - Math.min(...ys);
			apply([
				{ x: 0, y: 0 },
				{ x: length, y: 0 },
				{ x: length, y: width },
				{ x: 0, y: width }
			]);
			seal();
		}
		form = target;
	}
</script>

<div
	class="grid grid-cols-[minmax(0,1fr)] gap-5 pb-2"
	role="group"
	aria-label={room.name}
	onfocusout={seal}
>
	<div class="grid grid-cols-2 gap-2.5">
		<div class="rounded-lg bg-surface-2 px-4 py-3">
			<p class="text-sm font-semibold text-muted">{t(messages, 'area')}</p>
			<p class="text-xl font-bold tabular-nums" data-testid="room-area">
				{formatArea(area, locale.language)}
			</p>
		</div>
		<div class="rounded-lg bg-surface-2 px-4 py-3">
			<p class="text-sm font-semibold text-muted">{t(messages, 'perimeter')}</p>
			<p class="text-xl font-bold tabular-nums" data-testid="room-perimeter">
				{formatLength(Math.round(around), settings.unit, locale.language)}
			</p>
		</div>
	</div>

	<SegmentedControl
		label={t(messages, 'form')}
		full
		value={form}
		items={[
			{ value: 'rect', label: t(messages, 'formRect') },
			{ value: 'template', label: t(messages, 'formTemplate') },
			{ value: 'free', label: t(messages, 'formFree') }
		]}
		onchange={switchForm}
	/>

	{#if form === 'rect'}
		<RectForm {room} onapply={apply} onseal={seal} />
	{:else if form === 'template'}
		<TemplateForm {room} onapply={apply} onseal={seal} />
	{:else}
		<FreeForm {room} onapply={apply} onrestructure={restructure} onseal={seal} />
	{/if}

	<p class="px-1 text-sm text-muted">{t(messages, 'cornersHint')}</p>

	<NumberField
		label={t(messages, 'height')}
		value={room.height}
		min={1000}
		max={10000}
		decreaseLabel={t(messages, 'less')}
		increaseLabel={t(messages, 'more')}
		oninput={(mm) => store.updateRoom(room.id, { height: mm }, { coalesce: `height-${room.id}` })}
		onchange={seal}
		data-testid="room-height"
	/>

	<NeighboursSection {room} />

	{#key room.id}
		<SlopeSection {room} />
	{/key}

	<AppearanceSection {room} />

	<div class="grid grid-cols-[minmax(0,1fr)] gap-1.5">
		<label for="room-notes-{room.id}" class="px-1 text-sm font-semibold text-muted">
			{t(messages, 'notes')}
		</label>
		<textarea
			id="room-notes-{room.id}"
			rows="3"
			value={room.notes ?? ''}
			placeholder={t(messages, 'notesPlaceholder')}
			oninput={(event) =>
				store.updateRoom(
					room.id,
					{ notes: event.currentTarget.value },
					{ coalesce: `notes-${room.id}` }
				)}
			onchange={seal}
			class="min-h-24 resize-y rounded-md border border-border bg-surface px-4 py-3 text-base transition duration-(--duration-fast) ease-soft outline-none placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent-soft"
		></textarea>
	</div>

	<div class="flex flex-wrap gap-2.5">
		<Button icon={Copy} onclick={() => duplicateAndSelect(room.id)} data-testid="room-duplicate">
			{t(messages, 'duplicate')}
		</Button>
		<Button
			icon={Trash2}
			variant="ghost"
			class="text-danger"
			onclick={() => (confirmDelete = true)}
			data-testid="room-delete"
		>
			{t(messages, 'delete')}
		</Button>
	</div>
</div>

<ConfirmDialog
	bind:open={confirmDelete}
	danger
	title={t(messages, 'deleteTitle', { name: room.name })}
	message={t(messages, 'deleteMessage')}
	confirmLabel={t(common, 'delete')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	onconfirm={() => deleteRoom(room.id)}
/>
