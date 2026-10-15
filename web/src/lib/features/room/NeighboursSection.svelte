<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { formatLength } from '#lib/core/units.ts';
	import type { Room } from '#lib/core/schema.ts';
	import { connections } from '#lib/features/board/connections.svelte.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom } from '#lib/state/ui.svelte.ts';
	import { messages } from './i18n.ts';

	let { room }: { room: Room } = $props();

	const rows = $derived(
		connections
			.roomLinks(room.id)
			.map((link) => ({ link, other: store.room(link.otherRoomId) }))
			.filter((row): row is { link: (typeof row)['link']; other: Room } => row.other !== undefined)
			.sort((a, b) => a.link.wall - b.link.wall || a.link.from - b.link.from)
	);
</script>

<section class="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="room-neighbours">
	<h3 class="px-1 text-sm font-semibold text-muted">{t(messages, 'neighbours')}</h3>
	{#if rows.length === 0}
		<p class="rounded-md bg-surface-2 px-4 py-3 text-sm text-muted" data-testid="neighbours-hint">
			{t(messages, 'neighboursHint')}
		</p>
	{:else}
		<ul class="grid gap-1.5">
			{#each rows as row (`${row.link.wall}-${row.link.otherRoomId}-${row.link.otherWall}`)}
				<li>
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
				</li>
			{/each}
		</ul>
	{/if}
</section>
