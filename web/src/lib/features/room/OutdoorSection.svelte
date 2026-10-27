<script lang="ts">
	import { RAILING_HEIGHT } from '#lib/core/defaults.ts';
	import { walls } from '#lib/core/geometry.ts';
	import type { Room } from '#lib/core/schema.ts';
	import { wallCorners } from '#lib/features/elements/logic.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import {
		DEFAULT_COVER_HEIGHT,
		DEFAULT_STRIP_DEPTH,
		MIN_STRIP_DEPTH,
		buildCover,
		inferCover,
		stripReach,
		type CoverShape
	} from './cover.ts';
	import { messages } from './i18n.ts';

	let { room }: { room: Room } = $props();

	const shape = $derived(inferCover(room));
	const height = $derived(room.cover?.height ?? DEFAULT_COVER_HEIGHT);
	const wallOptions = $derived(
		walls(room.polygon).map((side) => ({
			value: String(side.number),
			label: t(messages, 'coverWallOption', {
				n: side.number,
				corners: wallCorners(room.polygon, side.number)
			})
		}))
	);

	function setCover(next: CoverShape, coalesce?: string): void {
		store.updateRoom(
			room.id,
			{ cover: buildCover(room, next, height) },
			coalesce ? { coalesce } : undefined
		);
	}

	function chooseMode(value: string): void {
		if (value === 'strip') {
			const wall = shape.mode === 'strip' ? shape.wall : 1;
			const depth = Math.min(DEFAULT_STRIP_DEPTH, stripReach(room, wall));
			setCover({ mode: 'strip', wall, depth });
		} else if (value === 'whole') setCover({ mode: 'whole' });
		else setCover({ mode: 'none' });
	}

	function setHeight(mm: number, coalesce: string): void {
		if (!room.cover) return;
		store.updateRoom(room.id, { cover: { ...room.cover, height: mm } }, { coalesce });
	}

	function seal(): void {
		store.sealHistory();
	}
</script>

<section class="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="outdoor-section">
	<h3 class="px-1 text-sm font-bold tracking-wide text-muted uppercase">
		{t(messages, 'outdoor')}
	</h3>

	{#if room.type === 'balcony'}
		<Switch
			checked={room.railing !== undefined}
			label={t(messages, 'railing')}
			description={t(messages, 'railingHint')}
			onchange={(on) =>
				store.updateRoom(room.id, { railing: on ? { height: RAILING_HEIGHT } : undefined })}
		/>
		{#if room.railing}
			<NumberField
				label={t(messages, 'railingHeight')}
				value={room.railing.height}
				min={600}
				max={2000}
				decreaseLabel={t(messages, 'less')}
				increaseLabel={t(messages, 'more')}
				oninput={(mm) =>
					store.updateRoom(
						room.id,
						{ railing: { height: mm } },
						{ coalesce: `railing-${room.id}` }
					)}
				onchange={seal}
				data-testid="railing-height"
			/>
		{/if}
	{/if}

	<div class="grid grid-cols-[minmax(0,1fr)] gap-3">
		<SegmentedControl
			full
			label={t(messages, 'cover')}
			items={[
				{ value: 'none', label: t(messages, 'coverNone') },
				{ value: 'whole', label: t(messages, 'coverWhole') },
				{ value: 'strip', label: t(messages, 'coverStrip') }
			]}
			value={shape.mode === 'custom' ? '' : shape.mode}
			onchange={chooseMode}
		/>
		<p class="px-1 text-sm text-muted">
			{shape.mode === 'custom' ? t(messages, 'coverCustomHint') : t(messages, 'coverHint')}
		</p>

		{#if shape.mode === 'strip'}
			<Select
				label={t(messages, 'coverWall')}
				options={wallOptions}
				value={String(shape.wall)}
				onchange={(value) =>
					setCover({
						mode: 'strip',
						wall: Number(value),
						depth: Math.min(shape.depth, stripReach(room, Number(value)))
					})}
			/>
			<NumberField
				label={t(messages, 'coverDepth')}
				value={shape.depth}
				min={MIN_STRIP_DEPTH}
				max={Math.max(MIN_STRIP_DEPTH, stripReach(room, shape.wall))}
				decreaseLabel={t(messages, 'less')}
				increaseLabel={t(messages, 'more')}
				oninput={(mm) =>
					setCover({ mode: 'strip', wall: shape.wall, depth: mm }, `cover-depth-${room.id}`)}
				onchange={seal}
				data-testid="cover-depth"
			/>
		{/if}

		{#if room.cover}
			<NumberField
				label={t(messages, 'coverHeight')}
				value={room.cover.height}
				min={1800}
				max={10000}
				decreaseLabel={t(messages, 'less')}
				increaseLabel={t(messages, 'more')}
				oninput={(mm) => setHeight(mm, `cover-height-${room.id}`)}
				onchange={seal}
				data-testid="cover-height"
			/>
		{/if}
	</div>
</section>
