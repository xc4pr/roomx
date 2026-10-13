<script lang="ts">
	import PanelTopOpen from '@lucide/svelte/icons/panel-top-open';
	import PanelTopClose from '@lucide/svelte/icons/panel-top-close';
	import { walls } from '#lib/core/geometry.ts';
	import { isWallElement, type RoomElement, type WallElement } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { elementKindNames } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Select from '#lib/ui/Select.svelte';
	import ElementEditor from './ElementEditor.svelte';
	import { messages } from './i18n.ts';
	import { KIND_ICONS, kindColor } from './kinds.ts';
	import { wallCorners } from './logic.ts';
	import Palette from './Palette.svelte';
	import Suggestions from './Suggestions.svelte';
	import WallElevation from './WallElevation.svelte';

	let { roomId }: { roomId: string } = $props();

	const room = $derived(store.room(roomId));
	const wallList = $derived(room ? walls(room.polygon) : []);
	const selected = $derived(room?.elements.find((element) => element.id === ui.selectedElementId));
	const groups = $derived.by(() => {
		if (!room) return [];
		const byWall = new Map<number, WallElement[]>();
		const ceiling: RoomElement[] = [];
		for (const element of room.elements) {
			if (!isWallElement(element)) ceiling.push(element);
			else byWall.set(element.wall, [...(byWall.get(element.wall) ?? []), element]);
		}
		const result = [...byWall.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([wall, elements]) => ({
				key: `wall-${wall}`,
				wall,
				title: t(messages, 'wallGroup', {
					n: wall,
					corners: wallCorners(room.polygon, wall)
				}),
				elements: elements.sort((a, b) => a.offset - b.offset) as RoomElement[]
			}));
		if (ceiling.length > 0) {
			result.push({ key: 'ceiling', wall: 0, title: t(messages, 'ceiling'), elements: ceiling });
		}
		return result;
	});

	const wallOptions = $derived(
		wallList.map((wall) => ({
			value: String(wall.number),
			label: t(messages, 'wallOption', {
				n: wall.number,
				corners: room ? wallCorners(room.polygon, wall.number) : ''
			})
		}))
	);
	const viewWall = $derived(ui.wallViewWall);

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function describe(element: RoomElement): string {
		if (!isWallElement(element)) {
			return t(messages, 'ceilingLampAt', { x: format(element.x), y: format(element.y) });
		}
		const start = room ? wallCorners(room.polygon, element.wall).split('–')[0] : '';
		return t(messages, 'rowInfo', {
			size: `${format(element.width)} × ${format(element.height)}`,
			distance: format(element.offset),
			corner: start
		});
	}

	function toggleWallView(): void {
		if (ui.wallViewWall !== null) {
			ui.wallViewWall = null;
			return;
		}
		ui.wallViewWall =
			selected && isWallElement(selected) ? selected.wall : (wallList[0]?.number ?? 1);
	}

	function pickFromPalette(): void {
		const first = document.querySelector<HTMLElement>('[data-testid="element-palette"] button');
		first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		first?.focus();
	}

	function select(element: RoomElement): void {
		ui.selectedElementId = element.id;
		ui.placingKind = null;
		if (isWallElement(element) && ui.wallViewWall !== null) ui.wallViewWall = element.wall;
	}
</script>

{#if room}
	<div class="flex flex-col gap-5" data-testid="elements-panel">
		<Palette {roomId} />

		{#if selected}
			{#key selected.id}
				<ElementEditor {roomId} elementId={selected.id} />
			{/key}
		{/if}

		<Suggestions {roomId} />

		<section class="flex flex-col gap-3" data-testid="wall-view-section">
			<div class="flex items-end gap-2">
				<Select
					class="min-w-0 flex-1"
					label={t(messages, 'wallView')}
					options={wallOptions}
					value={String(viewWall ?? (selected && isWallElement(selected) ? selected.wall : 1))}
					onchange={(value) => (ui.wallViewWall = Number(value))}
				/>
				<Button
					variant={viewWall === null ? 'secondary' : 'primary'}
					icon={viewWall === null ? PanelTopOpen : PanelTopClose}
					onclick={toggleWallView}
					data-testid="wall-view-toggle"
				>
					{viewWall === null ? t(messages, 'wallViewOpen') : t(messages, 'wallViewClose')}
				</Button>
			</div>
			{#if viewWall !== null}
				<WallElevation {roomId} wall={viewWall} />
			{/if}
		</section>

		<section class="flex flex-col gap-3" data-testid="element-list">
			<h3 class="text-sm font-bold">{t(messages, 'listTitle', { n: room.elements.length })}</h3>
			{#if room.elements.length === 0}
				<EmptyState
					class="rounded-lg bg-surface-2 py-5!"
					title={t(messages, 'listEmptyTitle')}
					description={t(messages, 'listEmpty')}
					actionLabel={t(messages, 'listEmptyAction')}
					onaction={pickFromPalette}
					data-testid="elements-empty"
				/>
			{/if}
			{#each groups as group (group.key)}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between gap-2 px-1">
						<h4 class="text-xs font-bold tracking-wide text-muted uppercase">{group.title}</h4>
						{#if group.wall > 0}
							<button
								type="button"
								class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-accent hover:bg-accent-soft"
								onclick={() => (ui.wallViewWall = group.wall)}
							>
								<PanelTopOpen class="size-4" />
								{t(messages, 'wallView')}
							</button>
						{/if}
					</div>
					<ul class="flex flex-col gap-1.5">
						{#each group.elements as element (element.id)}
							{@const Icon = KIND_ICONS[element.kind]}
							<li>
								<button
									type="button"
									data-row={element.id}
									aria-pressed={ui.selectedElementId === element.id}
									onclick={() => select(element)}
									class="flex min-h-14 w-full items-center gap-3 rounded-md border px-3 text-left transition duration-(--duration-fast) ease-soft active:scale-[0.99] {ui.selectedElementId ===
									element.id
										? 'border-accent bg-accent-soft'
										: 'border-border bg-surface hover:bg-surface-2'}"
								>
									<span class="shrink-0" style="color: {kindColor(element.kind)}">
										<Icon class="size-5" />
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm font-semibold">
											{t(elementKindNames, element.kind)}
										</span>
										<span class="block truncate text-xs text-muted">{describe(element)}</span>
									</span>
									{#if element.status === 'planned'}
										<span
											class="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted"
										>
											{t(messages, 'statusPlanned')}
										</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</section>
	</div>
{/if}
