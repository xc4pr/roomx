<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import House from '@lucide/svelte/icons/house';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import { untrack } from 'svelte';
	import { cornerLabel, wallSlopes, walls } from '#lib/core/geometry.ts';
	import { newId } from '#lib/core/ids.ts';
	import type { Room, Slope } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';
	import {
		DORMER_WINDOW_MARGIN,
		MIN_DORMER_WINDOW,
		addDormer,
		addSection,
		angleForDepth,
		depthOf,
		dormerWidthForWindow,
		dormerWindow,
		freeDormerGap,
		freeSectionGap,
		isWholeWall,
		removeDormer,
		resizeDormer,
		resizeSection,
		restrictToPart,
		sectionBounds,
		sectionSpan,
		widenToWholeWall
	} from './sections.ts';
	import { clampAngle, defaultSlope, formatAngle, SLOPE_ANGLES, slopeInfo } from './slopeInfo.ts';

	let { room }: { room: Room } = $props();

	type Entry = 'angle' | 'depth';

	let open = $state(untrack(() => (room.slopes?.length ?? 0) > 0));
	let entry = $state<Record<string, Entry>>({});
	const count = $derived(room.slopes?.length ?? 0);
	const sides = $derived(walls(room.polygon));
	const exampleAngle = $derived(angleForDepth({ height: 2500 }, 500, 2000));

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function commit(wall: number, next: Slope[], key?: string): void {
		store.setWallSlopes(room.id, wall, next, key ? { coalesce: `${key}-${room.id}` } : undefined);
	}

	function replace(sections: Slope[], next: Slope): Slope[] {
		return sections.map((slope) => (slope.id === next.id ? next : slope));
	}

	function toggle(wall: number, on: boolean): void {
		store.sealHistory();
		commit(wall, on ? [{ id: newId(), wall, ...defaultSlope(room) }] : []);
	}

	function patch(sections: Slope[], slope: Slope, change: Partial<Slope>, key: string): void {
		commit(slope.wall, replace(sections, { ...slope, ...change }), key);
	}

	function setAngle(sections: Slope[], slope: Slope, angle: number, key: string): void {
		patch(sections, slope, { angle: clampAngle(angle) }, key);
	}

	function parseAngle(text: string): number | undefined {
		const value = Number.parseFloat(text.replace(',', '.'));
		return Number.isFinite(value) ? value : undefined;
	}

	function seal(): void {
		store.sealHistory();
	}

	function sectionStart(sections: Slope[], slope: Slope, wallLength: number): void {
		store.sealHistory();
		commit(slope.wall, replace(sections, restrictToPart(slope, wallLength)));
	}

	function sectionWhole(slope: Slope): void {
		store.sealHistory();
		commit(slope.wall, [widenToWholeWall(slope)]);
	}

	function sectionAdd(wall: number, sections: Slope[], wallLength: number): void {
		const next = addSection(sections, wall, wallLength, newId);
		if (!next) return;
		store.sealHistory();
		commit(wall, next);
	}

	function sectionRemove(sections: Slope[], slope: Slope): void {
		store.sealHistory();
		commit(
			slope.wall,
			sections.filter((candidate) => candidate.id !== slope.id)
		);
	}

	function dormerAdd(sections: Slope[], slope: Slope, wallLength: number): void {
		const next = addDormer(slope, wallLength, room, newId);
		if (!next) return;
		store.sealHistory();
		commit(slope.wall, replace(sections, next));
	}

	function dormerChange(
		sections: Slope[],
		slope: Slope,
		id: string,
		change: Parameters<typeof resizeDormer>[2],
		wallLength: number
	): void {
		commit(
			slope.wall,
			replace(sections, resizeDormer(slope, id, change, wallLength, room)),
			`dormer-${id}`
		);
	}

	function dormerRemove(sections: Slope[], slope: Slope, id: string): void {
		store.sealHistory();
		commit(slope.wall, replace(sections, removeDormer(slope, id)));
	}

	function dormerWindowAdd(slope: Slope, id: string): void {
		const dormer = slope.dormers?.find((candidate) => candidate.id === id);
		if (!dormer) return;
		const element = dormerWindow(room, slope, dormer, newId);
		if (!element) return;
		store.sealHistory();
		store.addElement(room.id, element);
		ui.selectedElementId = element.id;
		toasts.show({ message: t(messages, 'slopeDormerWindowAdded'), kind: 'success' });
	}
</script>

<section class="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="slopes-section">
	<button
		type="button"
		aria-expanded={open}
		onclick={() => (open = !open)}
		class="-mx-1 flex min-h-11 items-center gap-2 rounded-md px-1 text-left text-sm font-bold tracking-wide text-muted uppercase transition duration-(--duration-fast) ease-soft hover:text-text"
		data-testid="slopes-toggle"
	>
		<House class="size-4.5" />
		<span class="min-w-0 flex-1">{t(messages, 'slopes')}</span>
		{#if count > 0}
			<span
				class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent normal-case pointer-coarse:text-sm"
			>
				{count}
			</span>
		{/if}
		<ChevronDown
			class="size-4.5 transition-transform duration-(--duration-base) ease-soft {open
				? 'rotate-180'
				: ''}"
		/>
	</button>

	{#if open}
		<div class="grid animate-fade-in grid-cols-[minmax(0,1fr)] gap-3">
			<p class="px-1 text-sm text-muted">{t(messages, 'slopesHint')}</p>
			{#each sides as side (side.number)}
				{@const sections = wallSlopes(room, side.number)}
				{@const wallLength = Math.round(side.length)}
				{@const startCorner = cornerLabel(side.startIndex)}
				{@const endCorner = cornerLabel(side.endIndex)}
				<div
					class="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg px-4 py-1 {sections.length > 0
						? 'bg-surface-2 pb-4'
						: ''}"
					data-testid="slope-wall-{side.number}"
				>
					<Switch
						checked={sections.length > 0}
						label={t(messages, 'slopeWall', {
							n: side.number,
							a: startCorner,
							b: endCorner
						})}
						onchange={(on) => toggle(side.number, on)}
					/>
					{#each sections as slope, index (slope.id)}
						{@const info = slopeInfo(room, slope)}
						{@const span = sectionSpan(slope, wallLength)}
						{@const bounds = sectionBounds(sections, slope.id, wallLength)}
						{@const mode = entry[slope.id] ?? 'angle'}
						{@const depth = depthOf(room, slope)}
						<div
							class="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-md bg-surface p-3"
							data-testid="slope-section-{side.number}-{index}"
						>
							{#if sections.length > 1 || !isWholeWall(slope)}
								<div class="flex min-h-11 items-center gap-2">
									<p class="min-w-0 flex-1 text-sm font-bold">
										{t(messages, 'slopeSectionN', { n: index + 1 })}
									</p>
									{#if sections.length > 1}
										<IconButton
											icon={Trash}
											label={t(messages, 'slopeRemoveSection')}
											variant="ghost"
											onclick={() => sectionRemove(sections, slope)}
										/>
									{/if}
								</div>
							{/if}
							{#if isWholeWall(slope)}
								<div class="flex flex-wrap items-center gap-2">
									<p class="min-w-0 flex-1 text-sm font-medium text-muted">
										{t(messages, 'slopeWhole')}
									</p>
									<Button
										variant="secondary"
										size="sm"
										onclick={() => sectionStart(sections, slope, wallLength)}
										data-testid="slope-part-{side.number}"
									>
										{t(messages, 'slopePart')}
									</Button>
								</div>
							{:else}
								<div class="grid grid-cols-2 gap-3">
									<NumberField
										stepper={false}
										label={t(messages, 'slopeFrom', { corner: startCorner })}
										value={span.from}
										min={bounds.min}
										max={span.to - 1}
										step={50}
										oninput={(mm) =>
											commit(
												side.number,
												resizeSection(sections, slope.id, { from: mm }, wallLength),
												`slope-from-${slope.id}`
											)}
										onchange={seal}
										data-testid="slope-from-{side.number}-{index}"
									/>
									<NumberField
										stepper={false}
										label={t(messages, 'slopeTo', { corner: startCorner })}
										value={span.to}
										min={span.from + 1}
										max={bounds.max}
										step={50}
										oninput={(mm) =>
											commit(
												side.number,
												resizeSection(sections, slope.id, { to: mm }, wallLength),
												`slope-to-${slope.id}`
											)}
										onchange={seal}
										data-testid="slope-to-{side.number}-{index}"
									/>
								</div>
								{#if sections.length === 1}
									<Button variant="ghost" size="sm" onclick={() => sectionWhole(slope)}>
										{t(messages, 'slopeWholeAgain')}
									</Button>
								{/if}
							{/if}
							<NumberField
								label={t(messages, 'slopeKnee')}
								hint={t(messages, 'slopeKneeHint')}
								value={slope.kneeHeight}
								min={0}
								max={room.height}
								decreaseLabel={t(messages, 'less')}
								increaseLabel={t(messages, 'more')}
								oninput={(mm) =>
									patch(sections, slope, { kneeHeight: mm }, `slope-knee-${slope.id}`)}
								onchange={seal}
								data-testid="slope-knee-{side.number}-{index}"
							/>
							<SegmentedControl
								full
								label={t(messages, 'slopeInput')}
								items={[
									{ value: 'angle', label: t(messages, 'slopeByAngle') },
									{ value: 'depth', label: t(messages, 'slopeByDepth') }
								]}
								value={mode}
								onchange={(value) => (entry[slope.id] = value as Entry)}
							/>
							{#if mode === 'angle'}
								<div class="flex flex-wrap items-center gap-2">
									{#each SLOPE_ANGLES as degrees (degrees)}
										<Chip
											selected={Math.abs(slope.angle - degrees) < 0.05}
											onclick={() => {
												setAngle(sections, slope, degrees, `slope-angle-${slope.id}`);
												seal();
											}}
										>
											{degrees}°
										</Chip>
									{/each}
									<TextField
										class="w-24"
										inputmode="decimal"
										value={String(slope.angle).replace('.', ',')}
										oninput={(text) => {
											const value = /^\d+$/.test(text.trim()) ? Number(text) : undefined;
											if (value !== undefined && value >= 5 && value <= 85)
												setAngle(sections, slope, value, `slope-angle-${slope.id}`);
										}}
										onchange={(text) => {
											const value = parseAngle(text);
											if (value !== undefined)
												setAngle(sections, slope, value, `slope-angle-${slope.id}`);
											seal();
										}}
										data-testid="slope-angle-{side.number}-{index}"
									>
										{#snippet trailing()}<span class="text-sm font-medium text-muted">°</span
											>{/snippet}
									</TextField>
								</div>
							{:else}
								<NumberField
									label={t(messages, 'slopeDepth')}
									hint={t(messages, 'slopeDepthHint')}
									value={depth}
									min={100}
									step={50}
									disabled={slope.kneeHeight >= room.height}
									decreaseLabel={t(messages, 'less')}
									increaseLabel={t(messages, 'more')}
									oninput={(mm) =>
										patch(
											sections,
											slope,
											{ angle: angleForDepth(room, slope.kneeHeight, mm) },
											`slope-depth-${slope.id}`
										)}
									onchange={seal}
									data-testid="slope-depth-{side.number}-{index}"
								/>
								<p class="px-1 text-sm text-muted">
									{t(messages, 'slopeDepthExample', {
										h: format(2500),
										k: format(500),
										d: format(2000),
										a: formatAngle(exampleAngle, locale.language)
									})}
								</p>
							{/if}
							<p class="px-1 text-sm font-semibold" data-testid="slope-both-{side.number}-{index}">
								{t(messages, 'slopeBoth', {
									angle: formatAngle(slope.angle, locale.language),
									depth: format(depth)
								})}
							</p>
							{#if info.kind !== 'none'}
								<p class="px-1 text-sm font-medium" data-testid="slope-info-{side.number}-{index}">
									{#if info.kind === 'standing'}
										{t(messages, 'slopeInfoStanding', {
											full: format(info.full),
											standing: format(info.standing)
										})}
									{:else if info.kind === 'standingAtWall'}
										{t(messages, 'slopeInfoStandingAtWall', { full: format(info.full) })}
									{:else}
										{t(messages, 'slopeInfoFull', { full: format(info.full) })}
									{/if}
								</p>
							{/if}

							<div class="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-border pt-3">
								<p class="px-1 text-sm font-bold">{t(messages, 'slopeDormers')}</p>
								{#each slope.dormers ?? [] as dormer, dormerIndex (dormer.id)}
									{@const dormerBounds = {
										min: Math.max(
											span.from,
											...(slope.dormers ?? []).filter((d) => d.to <= dormer.from).map((d) => d.to)
										),
										max: Math.min(
											span.to,
											...(slope.dormers ?? []).filter((d) => d.from >= dormer.to).map((d) => d.from)
										)
									}}
									{@const narrow = dormerWidthForWindow(dormer) < MIN_DORMER_WINDOW}
									<div
										class="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-md bg-surface-2 p-3"
										data-testid="slope-dormer-{side.number}-{index}-{dormerIndex}"
									>
										<div class="flex min-h-11 items-center gap-2">
											<p class="min-w-0 flex-1 text-sm font-semibold">
												{t(messages, 'slopeDormerN', { n: dormerIndex + 1 })}
											</p>
											<IconButton
												icon={Trash}
												label={t(messages, 'slopeDormerRemove')}
												variant="ghost"
												onclick={() => dormerRemove(sections, slope, dormer.id)}
											/>
										</div>
										<div class="grid grid-cols-2 gap-3">
											<NumberField
												stepper={false}
												label={t(messages, 'slopeDormerFrom')}
												value={dormer.from}
												min={dormerBounds.min}
												max={dormer.to - 1}
												step={50}
												oninput={(mm) =>
													dormerChange(sections, slope, dormer.id, { from: mm }, wallLength)}
												onchange={seal}
												data-testid="dormer-from-{side.number}-{index}-{dormerIndex}"
											/>
											<NumberField
												stepper={false}
												label={t(messages, 'slopeDormerTo')}
												value={dormer.to}
												min={dormer.from + 1}
												max={dormerBounds.max}
												step={50}
												oninput={(mm) =>
													dormerChange(sections, slope, dormer.id, { to: mm }, wallLength)}
												onchange={seal}
												data-testid="dormer-to-{side.number}-{index}-{dormerIndex}"
											/>
											<NumberField
												stepper={false}
												label={t(messages, 'slopeDormerHeight')}
												value={dormer.height}
												min={100}
												max={room.height}
												step={50}
												oninput={(mm) =>
													dormerChange(sections, slope, dormer.id, { height: mm }, wallLength)}
												onchange={seal}
												data-testid="dormer-height-{side.number}-{index}-{dormerIndex}"
											/>
										</div>
										<Button
											variant="secondary"
											size="sm"
											disabled={narrow}
											onclick={() => dormerWindowAdd(slope, dormer.id)}
											data-testid="dormer-window-{side.number}-{index}-{dormerIndex}"
										>
											{t(messages, 'slopeDormerWindow')}
										</Button>
										{#if narrow}
											<p class="px-1 text-sm text-muted">
												{t(messages, 'slopeDormerWindowNarrow', {
													min: format(MIN_DORMER_WINDOW + 2 * DORMER_WINDOW_MARGIN)
												})}
											</p>
										{/if}
									</div>
								{/each}
								<p class="px-1 text-sm text-muted">{t(messages, 'slopeDormerHint')}</p>
								<Button
									variant="secondary"
									size="sm"
									icon={Plus}
									disabled={!freeDormerGap(slope, wallLength)}
									onclick={() => dormerAdd(sections, slope, wallLength)}
									data-testid="dormer-add-{side.number}-{index}"
								>
									{t(messages, 'slopeAddDormer')}
								</Button>
								{#if !freeDormerGap(slope, wallLength)}
									<p class="px-1 text-sm text-muted">{t(messages, 'slopeNoDormerGap')}</p>
								{/if}
							</div>
						</div>
					{/each}
					{#if sections.length > 0 && !(sections.length === 1 && isWholeWall(sections[0]))}
						<Button
							variant="secondary"
							size="sm"
							icon={Plus}
							disabled={!freeSectionGap(sections, wallLength)}
							onclick={() => sectionAdd(side.number, sections, wallLength)}
							data-testid="slope-add-{side.number}"
						>
							{t(messages, 'slopeAddSection')}
						</Button>
						{#if !freeSectionGap(sections, wallLength)}
							<p class="px-1 text-sm text-muted">{t(messages, 'slopeNoGap')}</p>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>
