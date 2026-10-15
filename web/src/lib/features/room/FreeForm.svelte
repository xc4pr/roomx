<script lang="ts">
	import Scissors from '@lucide/svelte/icons/scissors';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { cornerLabel, normalizePolygon } from '#lib/core/geometry.ts';
	import type { Point, Room, RoomElement } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { untrack } from 'svelte';
	import { messages } from './i18n.ts';
	import PolygonPreview from './PolygonPreview.svelte';
	import { remapAfterInsert, remapAfterRemove } from './polygonEdit.ts';
	import {
		CLOSE_TOLERANCE,
		closeLastWall,
		closingGap,
		distributeGap,
		interiorFromTurn,
		normalizeTurn,
		polygonKey,
		polygonProblem,
		rowsFromPolygon,
		splitWall,
		traverse,
		turnFromInterior,
		type WallRow
	} from './walls.ts';

	interface Props {
		room: Room;
		onapply: (polygon: Point[]) => void;
		onrestructure: (polygon: Point[], elements: RoomElement[]) => void;
		onseal: () => void;
	}

	let { room, onapply, onrestructure, onseal }: Props = $props();

	const QUICK = [90, 135, 270, 45];

	let rows = $state<WallRow[]>(untrack(() => rowsFromPolygon(room.polygon)));
	let auto = $state(true);
	let note = $state<string | undefined>();
	let lastKey = untrack(() => polygonKey(room.polygon));

	$effect(() => {
		const key = polygonKey(room.polygon);
		if (key === lastKey) return;
		lastKey = key;
		rows = rowsFromPolygon(room.polygon);
		note = undefined;
	});

	const count = $derived(rows.length);
	const trace = $derived(traverse(rows));
	const gap = $derived(closingGap(rows));
	const closed = $derived(gap <= CLOSE_TOLERANCE);
	const problem = $derived(closed ? polygonProblem(trace.points) : undefined);

	function lockedLength(index: number): boolean {
		return auto && index === count - 1;
	}

	function lockedTurn(index: number): boolean {
		return index === count - 1 || (auto && index === count - 2);
	}

	function commit(next: WallRow[]): void {
		note = undefined;
		const lastTurn = normalizeTurn(-next.slice(0, -1).reduce((sum, row) => sum + row.turn, 0));
		let result = next.map((row, i) => (i === next.length - 1 ? { ...row, turn: lastTurn } : row));
		if (auto) result = closeLastWall(result);
		rows = result;
		const { points, end } = traverse(result);
		if (Math.hypot(end.x, end.y) > CLOSE_TOLERANCE) return;
		if (polygonProblem(points)) return;
		const polygon = normalizePolygon(points);
		lastKey = polygonKey(polygon);
		onapply(polygon);
	}

	function setLength(index: number, mm: number): void {
		commit(rows.map((row, i) => (i === index ? { ...row, length: mm } : row)));
	}

	function setInterior(index: number, degrees: number): void {
		if (!(degrees > 0 && degrees < 360)) return;
		commit(rows.map((row, i) => (i === index ? { ...row, turn: turnFromInterior(degrees) } : row)));
	}

	function parseAngle(text: string): number | undefined {
		const value = Number.parseFloat(text.replace(',', '.'));
		return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
	}

	function setAuto(value: boolean): void {
		auto = value;
		commit(rows);
		onseal();
	}

	function spread(): void {
		commit(distributeGap(rows));
		onseal();
	}

	function split(index: number): void {
		if (!closed || problem) return;
		const polygon = splitWall(room.polygon, index);
		const half = Math.round(rows[index].length / 2);
		lastKey = polygonKey(polygon);
		onrestructure(polygon, remapAfterInsert(room.elements, index + 1, half));
		rows = rowsFromPolygon(polygon);
	}

	function removeCorner(index: number): void {
		const corner = (index + 1) % count;
		if (!closed || problem || corner === 0 || count <= 3) return;
		const polygon = room.polygon.filter((_, i) => i !== corner);
		if (polygonProblem(polygon)) {
			note = t(messages, 'removeBlocked');
			return;
		}
		lastKey = polygonKey(polygon);
		onrestructure(polygon, remapAfterRemove(room.elements, corner, rows[corner - 1].length));
		rows = rowsFromPolygon(polygon);
		note = undefined;
	}

	function problemText(): string {
		switch (problem) {
			case 'cross':
				return t(messages, 'problemCross');
			case 'short':
				return t(messages, 'problemShort');
			case 'flat':
				return t(messages, 'problemFlat');
			default:
				return t(messages, 'problemFew');
		}
	}

	const canEdit = $derived(closed && !problem);
</script>

<div class="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="free-form">
	<PolygonPreview
		points={trace.points}
		end={closed ? undefined : trace.end}
		closed={closed && !problem}
		label={t(messages, 'previewLabel')}
	/>

	<Switch
		checked={auto}
		label={t(messages, 'autoClose')}
		description={t(messages, 'autoCloseHint')}
		onchange={setAuto}
	/>

	{#if !closed}
		<div class="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg bg-danger-soft p-3.5" role="alert">
			<div>
				<p class="font-bold text-danger">{t(messages, 'gapTitle')}</p>
				<p class="text-sm text-danger">
					{t(messages, 'gapText', {
						gap: formatLength(Math.round(gap), settings.unit, locale.language)
					})}
				</p>
			</div>
			<Button variant="danger" onclick={spread} data-testid="distribute">
				{t(messages, 'distribute')}
			</Button>
		</div>
	{:else if problem}
		<p class="rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">
			{problemText()}
		</p>
	{/if}
	{#if note}
		<p
			class="rounded-md bg-warning-soft px-3 py-2.5 text-sm font-medium text-warning"
			role="status"
		>
			{note}
		</p>
	{/if}

	<ol class="grid grid-cols-[minmax(0,1fr)] gap-3">
		{#each rows as row, index (index)}
			{@const nextLabel = cornerLabel((index + 1) % count)}
			<li
				class="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-border bg-surface p-3.5"
				data-testid="wall-row"
			>
				<div class="flex items-center gap-2">
					<span
						class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent"
					>
						{index + 1}
					</span>
					<span class="min-w-0 grow text-sm font-semibold text-muted">
						{t(messages, 'cornerTo', { a: cornerLabel(index), b: nextLabel })}
					</span>
					<IconButton
						icon={Scissors}
						label={t(messages, 'splitWall')}
						disabled={!canEdit}
						onclick={() => split(index)}
					/>
					<IconButton
						icon={Trash2}
						variant="danger"
						label={t(messages, 'removeCorner', { c: nextLabel })}
						disabled={!canEdit || count <= 3 || (index + 1) % count === 0}
						onclick={() => removeCorner(index)}
					/>
				</div>
				<NumberField
					label={lockedLength(index)
						? `${t(messages, 'wallLength')} · ${t(messages, 'derived')}`
						: t(messages, 'wallLength')}
					value={row.length}
					min={50}
					max={80000}
					stepper={!lockedLength(index)}
					disabled={lockedLength(index)}
					decreaseLabel={t(messages, 'less')}
					increaseLabel={t(messages, 'more')}
					oninput={(mm) => setLength(index, mm)}
					onchange={onseal}
				/>
				<div class="grid grid-cols-[minmax(0,1fr)] gap-2">
					<p class="px-1 text-sm font-semibold text-muted">
						{t(messages, 'angleAt', { c: nextLabel })}{lockedTurn(index)
							? ` · ${t(messages, 'derived')}`
							: ''}
					</p>
					<div class="flex flex-wrap items-center gap-2">
						{#each QUICK as degrees (degrees)}
							<Chip
								selected={Math.abs(interiorFromTurn(row.turn) - degrees) < 0.01}
								disabled={lockedTurn(index)}
								onclick={() => {
									setInterior(index, degrees);
									onseal();
								}}
							>
								{degrees}°
							</Chip>
						{/each}
						<TextField
							class="w-24"
							inputmode="decimal"
							disabled={lockedTurn(index)}
							value={String(interiorFromTurn(row.turn)).replace('.', ',')}
							onchange={(text) => {
								const value = parseAngle(text);
								if (value !== undefined) setInterior(index, value);
								onseal();
							}}
						>
							{#snippet trailing()}<span class="text-sm font-medium text-muted">°</span>{/snippet}
						</TextField>
					</div>
				</div>
			</li>
		{/each}
	</ol>
</div>
