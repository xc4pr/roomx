<script lang="ts">
	import BrickWall from '@lucide/svelte/icons/brick-wall';
	import CornerDownRight from '@lucide/svelte/icons/corner-down-right';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Rotate from '@lucide/svelte/icons/refresh-cw';
	import {
		isFireElement,
		type AcFloor,
		type Column,
		type Fireplace,
		type FreeElement,
		type FreeObstacle,
		type Stove,
		type TiledStove
	} from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { dockToCorner, dockToWall, rotateBy } from './free.ts';
	import { messages } from './i18n.ts';
	import { MIN_WIDTH } from './logic.ts';

	let {
		roomId,
		element,
		polygon
	}: { roomId: string; element: FreeElement; polygon: { x: number; y: number }[] } = $props();

	const clearanceKind = $derived(
		isFireElement(element) ? 'fire' : element.kind === 'acFloor' ? 'air' : null
	);
	const reachesCeiling = $derived(
		(element.kind === 'column' || element.kind === 'freeObstacle') && element.toCeiling === true
	);

	function patch<E extends FreeElement = FreeElement>(
		values: Partial<Omit<E, 'id' | 'kind'>>,
		name?: string
	): void {
		store.updateElement<E>(
			roomId,
			element.id,
			values,
			name ? { coalesce: `ed-${element.id}-${name}` } : undefined
		);
	}

	function seal(): void {
		store.sealHistory();
	}

	function turn(degrees: number): void {
		patch({ rotation: rotateBy(element.rotation, degrees) });
	}

	function toWall(): void {
		const pose = dockToWall(polygon, element);
		if (pose) patch(pose);
	}

	function toCorner(): void {
		const pose = dockToCorner(polygon, element);
		if (pose) patch(pose);
	}
</script>

<div class="flex flex-col gap-4" data-testid="free-fields">
	<div class="grid grid-cols-2 gap-3">
		<NumberField
			stepper={false}
			label={t(messages, 'width')}
			value={element.width}
			min={MIN_WIDTH}
			step={10}
			oninput={(mm) => patch({ width: mm }, 'width')}
			onchange={seal}
		/>
		<NumberField
			stepper={false}
			label={t(messages, 'depth')}
			value={element.depth}
			min={MIN_WIDTH}
			step={10}
			oninput={(mm) => patch({ depth: mm }, 'depth')}
			onchange={seal}
		/>
		<NumberField
			stepper={false}
			label={t(messages, 'height')}
			value={element.height}
			min={MIN_WIDTH}
			step={10}
			disabled={reachesCeiling}
			oninput={(mm) => patch({ height: mm }, 'height')}
			onchange={seal}
		/>
		<NumberField
			stepper={false}
			label={t(messages, 'elevation')}
			value={element.elevation}
			min={0}
			step={10}
			oninput={(mm) => patch({ elevation: mm }, 'elevation')}
			onchange={seal}
		/>
		<NumberField
			stepper={false}
			label={t(messages, 'positionX')}
			value={element.x}
			step={10}
			oninput={(mm) => patch({ x: mm }, 'x')}
			onchange={seal}
		/>
		<NumberField
			stepper={false}
			label={t(messages, 'positionY')}
			value={element.y}
			step={10}
			oninput={(mm) => patch({ y: mm }, 'y')}
			onchange={seal}
		/>
	</div>

	{#if element.kind === 'column'}
		<SegmentedControl
			full
			label={t(messages, 'shape')}
			items={[
				{ value: 'round', label: t(messages, 'shapeRound') },
				{ value: 'square', label: t(messages, 'shapeSquare') }
			]}
			value={element.shape}
			onchange={(value) => patch<Column>({ shape: value as Column['shape'] })}
		/>
	{/if}
	{#if element.kind === 'column' || element.kind === 'freeObstacle'}
		<Switch
			checked={element.toCeiling === true}
			label={t(messages, 'toCeiling')}
			description={t(messages, 'toCeilingHint')}
			onchange={(checked) => patch<Column | FreeObstacle>({ toCeiling: checked || undefined })}
		/>
	{/if}

	{#if clearanceKind && 'clearance' in element}
		<div class="flex flex-col gap-1">
			<NumberField
				stepper={false}
				label={t(messages, clearanceKind === 'fire' ? 'clearanceFire' : 'clearanceAir')}
				hint={t(messages, 'clearanceHint')}
				value={element.clearance}
				min={0}
				step={50}
				oninput={(mm) =>
					patch<Fireplace | Stove | TiledStove | AcFloor>({ clearance: mm }, 'clearance')}
				onchange={seal}
			/>
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		<span class="px-1 text-sm font-semibold text-muted">
			{t(messages, 'rotation')} · {t(messages, 'rotationValue', {
				deg: Math.round(element.rotation)
			})}
		</span>
		<div class="flex items-center gap-2">
			<IconButton
				icon={RotateCcw}
				label={t(messages, 'rotateLeft')}
				variant="secondary"
				onclick={() => turn(15)}
			/>
			<IconButton
				icon={RotateCw}
				label={t(messages, 'rotateRight')}
				variant="secondary"
				onclick={() => turn(-15)}
			/>
			<IconButton
				icon={Rotate}
				label={t(messages, 'rotate90')}
				variant="secondary"
				onclick={() => turn(90)}
			/>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button variant="secondary" icon={BrickWall} onclick={toWall} data-testid="to-wall">
				{t(messages, 'toWall')}
			</Button>
			{#if element.kind === 'fireplace'}
				<Button
					variant="secondary"
					icon={CornerDownRight}
					onclick={toCorner}
					data-testid="to-corner"
				>
					{t(messages, 'toCorner')}
				</Button>
			{/if}
		</div>
	</div>
</div>
