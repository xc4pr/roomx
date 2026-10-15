<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { WALL_THICKNESS_PRESETS, type WallLink } from '#lib/core/adjacency.ts';
	import { formatLength } from '#lib/core/units.ts';
	import type { Room } from '#lib/core/schema.ts';
	import { connections } from '#lib/features/board/connections.svelte.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom } from '#lib/state/ui.svelte.ts';
	import Chip from '#lib/ui/Chip.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';
	import { changeThickness } from './thickness.ts';

	let { room }: { room: Room } = $props();

	const rows = $derived(
		connections
			.roomLinks(room.id)
			.map((link) => ({ link, other: store.room(link.otherRoomId) }))
			.filter((row): row is { link: (typeof row)['link']; other: Room } => row.other !== undefined)
			.sort((a, b) => a.link.wall - b.link.wall || a.link.from - b.link.from)
	);

	function show(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function choose(link: WallLink, other: Room, thickness: number): void {
		const change = changeThickness(store.project?.rooms ?? [], link, thickness);
		if (change.moves.length === 0) return;
		store.mutate((project) => {
			for (const move of change.moves) {
				const target = project.rooms.find((candidate) => candidate.id === move.roomId);
				if (target) target.boardPos = move.boardPos;
			}
		});
		if (change.detached)
			toasts.show({ message: t(messages, 'thicknessMoved', { room: other.name }) });
	}
</script>

<section class="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="room-neighbours">
	<h3 class="px-1 text-sm font-semibold text-muted">{t(messages, 'neighbours')}</h3>
	{#if rows.length === 0}
		<p class="rounded-md bg-surface-2 px-4 py-3 text-sm text-muted" data-testid="neighbours-hint">
			{t(messages, 'neighboursHint')}
		</p>
	{:else}
		<ul class="grid grid-cols-[minmax(0,1fr)] gap-1.5">
			{#each rows as row (`${row.link.wall}-${row.link.otherRoomId}-${row.link.otherWall}`)}
				<li class="min-w-0">
					<button
						type="button"
						onclick={() => selectRoom(row.other.id)}
						aria-label={t(messages, 'neighbourJump', { room: row.other.name })}
						data-neighbour={row.other.id}
						class="flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-surface px-3 text-left transition duration-(--duration-fast) ease-soft hover:bg-surface-2 active:scale-[0.99]"
					>
						<Link2 class="size-5 shrink-0 text-muted" />
						<span class="min-w-0 flex-1 text-sm font-semibold">
							{t(messages, 'neighbourLine', {
								n: row.link.wall,
								room: row.other.name,
								m: row.link.otherWall,
								length: formatLength(row.link.to - row.link.from, settings.unit, locale.language)
							})}
						</span>
						<ChevronRight class="size-5 shrink-0 text-muted" />
					</button>
					<p class="px-1 pt-2 pb-1 text-xs font-semibold text-muted">
						{t(messages, 'thicknessLabel', {
							room: row.other.name,
							value: show(row.link.thickness)
						})}
					</p>
					<div
						class="flex flex-wrap gap-2 py-0.5"
						role="group"
						aria-label={t(messages, 'thicknessGroup', { room: row.other.name })}
						data-testid="thickness-chips"
					>
						{#each WALL_THICKNESS_PRESETS as preset (preset)}
							<Chip
								selected={row.link.thickness === preset}
								onclick={() => choose(row.link, row.other, preset)}
								data-testid="thickness-{preset}"
							>
								{show(preset)}
							</Chip>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="mt-1 rounded-md bg-surface-2 px-4 py-1" data-testid="room-separate">
		<Switch
			checked={room.separate === true}
			label={t(messages, 'separate')}
			description={t(messages, 'separateHint')}
			onchange={(separate) => store.updateRoom(room.id, { separate })}
		/>
	</div>
</section>
