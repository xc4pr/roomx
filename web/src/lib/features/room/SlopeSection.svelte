<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import House from '@lucide/svelte/icons/house';
	import { untrack } from 'svelte';
	import { cornerLabel, wallSlope, walls } from '#lib/core/geometry.ts';
	import type { Room } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import Chip from '#lib/ui/Chip.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { messages } from './i18n.ts';
	import { clampAngle, defaultSlope, SLOPE_ANGLES, slopeInfo } from './slopeInfo.ts';

	let { room }: { room: Room } = $props();

	let open = $state(untrack(() => (room.slopes?.length ?? 0) > 0));
	const count = $derived(room.slopes?.length ?? 0);
	const sides = $derived(walls(room.polygon));

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function toggle(wall: number, on: boolean): void {
		store.sealHistory();
		store.setSlope(room.id, wall, on ? defaultSlope(room) : null);
	}

	function setKnee(wall: number, kneeHeight: number): void {
		const current = wallSlope(room, wall);
		if (!current) return;
		store.setSlope(
			room.id,
			wall,
			{ kneeHeight, angle: current.angle },
			{ coalesce: `slope-knee-${room.id}-${wall}` }
		);
	}

	function setAngle(wall: number, angle: number, coalesce: boolean): void {
		const current = wallSlope(room, wall);
		if (!current) return;
		store.setSlope(
			room.id,
			wall,
			{ kneeHeight: current.kneeHeight, angle: clampAngle(angle) },
			coalesce ? { coalesce: `slope-angle-${room.id}-${wall}` } : undefined
		);
	}

	function parseAngle(text: string): number | undefined {
		const value = Number.parseFloat(text.replace(',', '.'));
		return Number.isFinite(value) ? value : undefined;
	}

	function seal(): void {
		store.sealHistory();
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
				class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent normal-case"
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
				{@const slope = wallSlope(room, side.number)}
				{@const info = slope ? slopeInfo(room, slope) : undefined}
				<div
					class="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg px-4 py-1 {slope
						? 'bg-surface-2 pb-4'
						: ''}"
					data-testid="slope-wall-{side.number}"
				>
					<Switch
						checked={slope !== undefined}
						label={t(messages, 'slopeWall', {
							n: side.number,
							a: cornerLabel(side.startIndex),
							b: cornerLabel(side.endIndex)
						})}
						onchange={(on) => toggle(side.number, on)}
					/>
					{#if slope}
						<NumberField
							label={t(messages, 'slopeKnee')}
							hint={t(messages, 'slopeKneeHint')}
							value={slope.kneeHeight}
							min={0}
							max={room.height}
							decreaseLabel={t(messages, 'less')}
							increaseLabel={t(messages, 'more')}
							oninput={(mm) => setKnee(side.number, mm)}
							onchange={seal}
							data-testid="slope-knee-{side.number}"
						/>
						<div class="grid grid-cols-[minmax(0,1fr)] gap-2">
							<p class="px-1 text-sm font-semibold text-muted">{t(messages, 'slopeAngle')}</p>
							<div class="flex flex-wrap items-center gap-2">
								{#each SLOPE_ANGLES as degrees (degrees)}
									<Chip
										selected={Math.abs(slope.angle - degrees) < 0.05}
										onclick={() => {
											setAngle(side.number, degrees, false);
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
											setAngle(side.number, value, true);
									}}
									onchange={(text) => {
										const value = parseAngle(text);
										if (value !== undefined) setAngle(side.number, value, true);
										seal();
									}}
									data-testid="slope-angle-{side.number}"
								>
									{#snippet trailing()}<span class="text-sm font-medium text-muted">°</span
										>{/snippet}
								</TextField>
							</div>
						</div>
						{#if info && info.kind !== 'none'}
							<p class="px-1 text-sm font-medium" data-testid="slope-info-{side.number}">
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
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>
