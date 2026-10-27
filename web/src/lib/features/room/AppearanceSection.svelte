<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Palette from '@lucide/svelte/icons/palette';
	import Pipette from '@lucide/svelte/icons/pipette';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { isOpenAir, type Room } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import {
		FLOOR_PRESETS,
		WALL_PRESETS,
		findPreset,
		isHexColor,
		type ColorPreset
	} from './colors.ts';
	import { messages } from './i18n.ts';

	type Target = 'floorColor' | 'wallColor';

	let { room }: { room: Room } = $props();

	const rows = $derived(
		[
			{
				target: 'floorColor' as const,
				label: t(messages, 'floor'),
				presets: FLOOR_PRESETS as readonly ColorPreset[],
				prefix: 'floor'
			},
			{
				target: 'wallColor' as const,
				label: t(messages, 'walls'),
				presets: WALL_PRESETS as readonly ColorPreset[],
				prefix: 'wall'
			}
		].filter((row) => row.target === 'floorColor' || !isOpenAir(room))
	);

	function current(target: Target): string | undefined {
		return room[target];
	}

	function choose(target: Target, hex: string | undefined): void {
		store.updateRoom(room.id, { [target]: hex });
	}

	function pickCustom(target: Target, hex: string, sealed: boolean): void {
		if (!isHexColor(hex)) return;
		store.updateRoom(room.id, { [target]: hex }, { coalesce: `${target}-${room.id}` });
		if (sealed) store.sealHistory();
	}

	function nameOf(prefix: string, preset: ColorPreset): string {
		return t(messages, `${prefix}_${preset.id}` as keyof (typeof messages)['de']);
	}
</script>

<section class="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label={t(messages, 'appearance')}>
	<h3 class="flex items-center gap-2 text-sm font-bold tracking-wide text-muted uppercase">
		<Palette class="size-4.5" />
		{t(messages, 'appearance')}
	</h3>
	{#each rows as row (row.target)}
		{@const value = current(row.target)}
		{@const preset = findPreset(row.presets, value)}
		<div class="grid gap-2" role="group" aria-label={row.label} data-testid="colors-{row.prefix}">
			<div class="flex items-baseline justify-between gap-3 px-1">
				<span class="text-sm font-semibold text-muted">{row.label}</span>
				<span class="truncate text-sm font-semibold">
					{preset
						? nameOf(row.prefix, preset)
						: value
							? t(messages, 'customColor')
							: t(messages, 'defaultColor')}
				</span>
			</div>
			<div class="-mx-1 flex flex-wrap gap-2 px-1 py-1">
				<button
					type="button"
					aria-pressed={!value}
					aria-label={t(messages, 'defaultColor')}
					title={t(messages, 'defaultColor')}
					onclick={() => choose(row.target, undefined)}
					class="relative inline-flex size-11 items-center justify-center rounded-full border-2 border-dashed text-muted transition duration-(--duration-fast) ease-spring select-none active:scale-90 {!value
						? 'border-accent text-accent'
						: 'border-border hover:border-muted'}"
					data-testid="color-{row.prefix}-default"
				>
					<RotateCcw class="size-4.5" />
				</button>
				{#each row.presets as swatch (swatch.id)}
					{@const active = value?.toLowerCase() === swatch.hex.toLowerCase()}
					<button
						type="button"
						aria-pressed={active}
						aria-label={nameOf(row.prefix, swatch)}
						title={nameOf(row.prefix, swatch)}
						onclick={() => choose(row.target, swatch.hex)}
						style:background-color={swatch.hex}
						class="relative inline-flex size-11 items-center justify-center rounded-full border border-border shadow-soft transition duration-(--duration-fast) ease-spring select-none active:scale-90 {active
							? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface'
							: 'hover:scale-105'}"
						data-testid="color-{row.prefix}-{swatch.id}"
					>
						{#if active}
							<span
								class="absolute -top-1 -right-1 inline-flex size-5 animate-pop-in items-center justify-center rounded-full bg-accent text-accent-contrast"
							>
								<Check class="size-3.5" />
							</span>
						{/if}
					</button>
				{/each}
				<label
					title={t(messages, 'customColor')}
					class="relative inline-flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed transition duration-(--duration-fast) ease-spring focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent active:scale-90 {value &&
					!preset
						? 'border-accent'
						: 'border-border text-muted hover:border-muted'}"
					style:background-color={value && !preset ? value : undefined}
				>
					<Pipette
						class="size-4.5 {value && !preset ? 'text-accent-contrast mix-blend-difference' : ''}"
					/>
					<span class="sr-only">{t(messages, 'customColor')}</span>
					<input
						type="color"
						class="absolute inset-0 size-full cursor-pointer opacity-0"
						value={isHexColor(value) ? value : '#cccccc'}
						oninput={(event) => pickCustom(row.target, event.currentTarget.value, false)}
						onchange={(event) => pickCustom(row.target, event.currentTarget.value, true)}
						aria-label="{row.label}: {t(messages, 'customColor')}"
						data-testid="color-{row.prefix}-custom"
					/>
				</label>
			</div>
		</div>
	{/each}
</section>
