<script lang="ts">
	import Footprints from '@lucide/svelte/icons/footprints';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { roomsBox } from '#lib/features/board/rooms.ts';
	import type { Stair, StairShape } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { floorRooms } from '#lib/core/floors.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { activeFloorId, ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { messages } from './i18n.ts';
	import {
		canAddStair,
		editorMaxHeight,
		MAX_STAIR_WIDTH,
		MIN_STAIR_WIDTH,
		newStair,
		normaliseAngle,
		summarise,
		TURN_STEP
	} from './logic.ts';

	let { build, reserve = 0 }: { build: boolean; reserve?: number } = $props();

	const project = $derived(store.project);
	const floorId = $derived(activeFloorId(project));
	const stair = $derived(
		project?.stairs?.find((candidate) => candidate.id === ui.selectedStairId) ?? undefined
	);
	const summary = $derived(project && stair ? summarise(project, stair) : undefined);
	const floorName = (id: string): string =>
		project?.floors?.find((floor) => floor.id === id)?.name ?? '';

	const length = (mm: number): string => formatLength(mm, settings.unit, locale.language);
	const centimetres = (mm: number): string =>
		`${(mm / 10).toLocaleString(locale.language === 'de' ? 'de-CH' : 'en', { maximumFractionDigits: 1 })} cm`;

	$effect(() => {
		if (ui.selectedRoomId !== null && ui.selectedStairId !== null) ui.selectedStairId = null;
	});

	$effect(() => {
		if (ui.selectedStairId !== null && !stair) ui.selectedStairId = null;
	});

	$effect(() => {
		if (stair && floorId && stair.fromFloorId !== floorId) ui.selectedStairId = null;
	});

	function add(): void {
		if (!project || !floorId) return;
		const box = roomsBox(floorRooms(project, floorId));
		const id = store.addStair(
			newStair(
				floorId,
				box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: 0, y: 0 }
			)
		);
		if (id) ui.selectedStairId = id;
	}

	function patch(values: Partial<Omit<Stair, 'id'>>, key?: string): void {
		if (stair) store.updateStair(stair.id, values, key ? { coalesce: key } : undefined);
	}

	function turnBy(degrees: number): void {
		if (stair) patch({ rotation: normaliseAngle(stair.rotation + degrees) });
	}

	function remove(): void {
		if (!stair) return;
		const id = stair.id;
		ui.selectedStairId = null;
		store.removeStair(id);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (!stair || !build) return;
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			remove();
		} else if (event.key === 'Escape') {
			ui.selectedStairId = null;
		}
	}

	const shapes: StairShape[] = ['straight', 'l', 'u', 'spiral'];
	const shapeItems = $derived(
		shapes.map((value) => ({ value, label: t(messages, `shape_${value}` as const) }))
	);
	const turnItems = $derived([
		{ value: 'left', label: t(messages, 'turn_left') },
		{ value: 'right', label: t(messages, 'turn_right') }
	]);
	const showAdd = $derived(
		build &&
			ui.selectedRoomId === null &&
			!stair &&
			!!project &&
			!!floorId &&
			canAddStair(project, floorId)
	);
</script>

<svelte:window {onkeydown} />

{#if build && project && floorId}
	{#if showAdd}
		<div
			class="absolute right-[max(1.25rem,var(--safe-right))] bottom-[calc(max(1rem,var(--safe-bottom))+4.5rem)] z-10"
		>
			<Button
				variant="secondary"
				icon={Footprints}
				class="rounded-full shadow-soft"
				onclick={add}
				data-testid="stair-add"
			>
				{t(messages, 'add')}
			</Button>
		</div>
	{/if}

	{#if stair}
		<section
			class="absolute bottom-[calc(max(1rem,var(--safe-bottom))+3.5rem)] left-[max(0.75rem,var(--safe-left))] z-10 grid w-[min(24rem,calc(100%-1.5rem))] animate-rise-in gap-3 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-surface p-3.5 shadow-float"
			style:max-height={editorMaxHeight(reserve)}
			aria-label={t(messages, 'title')}
			data-testid="stair-editor"
		>
			<header class="flex items-center gap-2">
				<h2 class="min-w-0 grow truncate text-base font-semibold">
					{t(messages, 'titleBetween', {
						from: floorName(stair.fromFloorId),
						to: summary ? summary.context.to.name : '–'
					})}
				</h2>
				<IconButton
					icon={Trash2}
					label={t(messages, 'remove')}
					variant="ghost"
					onclick={remove}
					data-testid="stair-remove"
				/>
				<IconButton
					icon={X}
					label={t(messages, 'close')}
					variant="ghost"
					onclick={() => (ui.selectedStairId = null)}
					data-testid="stair-close"
				/>
			</header>

			<SegmentedControl
				label={t(messages, 'shape')}
				items={shapeItems}
				value={stair.shape}
				full
				onchange={(value) => patch({ shape: value as StairShape })}
			/>

			<div class="grid gap-3">
				<NumberField
					label={t(messages, 'width')}
					value={stair.width}
					min={MIN_STAIR_WIDTH}
					max={MAX_STAIR_WIDTH}
					step={50}
					stepper
					decreaseLabel={t(messages, 'widthDecrease')}
					increaseLabel={t(messages, 'widthIncrease')}
					oninput={(mm) => patch({ width: mm }, `stair-width-${stair.id}`)}
					onchange={() => store.sealHistory()}
				/>
				{#if stair.shape !== 'straight'}
					<SegmentedControl
						label={t(messages, 'turn')}
						items={turnItems}
						value={stair.turn}
						onchange={(value) => patch({ turn: value as Stair['turn'] })}
					/>
				{/if}
			</div>

			<div
				class="flex flex-wrap items-center gap-1"
				role="group"
				aria-label={t(messages, 'direction')}
			>
				<span class="w-full text-sm text-muted">
					{t(messages, 'direction')}: {Math.round(stair.rotation)}°
				</span>
				<Button size="md" variant="secondary" icon={RotateCcw} onclick={() => turnBy(90)}>
					<span aria-hidden="true">90°</span><span class="sr-only">{t(messages, 'turnLeft90')}</span
					>
				</Button>
				<IconButton
					icon={RotateCcw}
					label={t(messages, 'turnLeft15')}
					onclick={() => turnBy(TURN_STEP)}
				/>
				<IconButton
					icon={RotateCw}
					label={t(messages, 'turnRight15')}
					onclick={() => turnBy(-TURN_STEP)}
				/>
				<Button size="md" variant="secondary" icon={RotateCw} onclick={() => turnBy(-90)}>
					<span aria-hidden="true">90°</span><span class="sr-only"
						>{t(messages, 'turnRight90')}</span
					>
				</Button>
			</div>

			{#if summary}
				<dl
					class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-sm"
					data-testid="stair-info"
				>
					<dt class="text-muted">{t(messages, 'steps')}</dt>
					<dd class="font-medium" data-testid="stair-steps">{summary.steps}</dd>
					<dt class="text-muted">{t(messages, 'riser')}</dt>
					<dd class="font-medium" data-testid="stair-riser">{centimetres(summary.riser)}</dd>
					<dt class="text-muted">{t(messages, 'tread')}</dt>
					<dd class="font-medium" data-testid="stair-tread">{centimetres(summary.tread)}</dd>
					<dt class="text-muted">{t(messages, 'stride')}</dt>
					<dd class="font-medium" data-testid="stair-stride">{centimetres(summary.stride)}</dd>
					<dt class="text-muted">{t(messages, 'run')}</dt>
					<dd class="font-medium" data-testid="stair-run">{length(summary.run)}</dd>
				</dl>
			{:else}
				<p class="rounded-lg bg-warning-soft p-3 text-sm">{t(messages, 'noUpper')}</p>
			{/if}
		</section>
	{/if}
{/if}
