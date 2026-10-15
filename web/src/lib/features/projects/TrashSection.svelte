<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { TRASH_DAYS, type TrashEntry } from '#lib/state/trash.ts';
	import Button from '#lib/ui/Button.svelte';
	import { messages } from './i18n.ts';

	interface Props {
		entries: TrashEntry[];
		onrestore: (entry: TrashEntry) => void;
		onpurge: (entry: TrashEntry) => void;
	}

	let { entries, onrestore, onpurge }: Props = $props();

	let open = $state(false);

	function remaining(entry: TrashEntry): string {
		if (entry.daysLeft <= 0) return t(messages, 'trashToday');
		return entry.daysLeft === 1
			? t(messages, 'trashDayLeft')
			: t(messages, 'trashDaysLeft', { n: entry.daysLeft });
	}
</script>

<section class="mt-10 border-t border-border pt-4" data-testid="trash-section">
	<button
		type="button"
		class="flex min-h-11 w-full items-center gap-3 rounded-md px-1 text-left transition duration-(--duration-fast) ease-soft hover:bg-surface-2"
		aria-expanded={open}
		aria-controls="trash-list"
		onclick={() => (open = !open)}
		data-testid="trash-toggle"
	>
		<Trash2 class="size-5 shrink-0 text-muted" />
		<span class="grow text-lg font-bold tracking-tight">
			{t(messages, 'trashTitle')}
			<span class="font-semibold text-muted">({entries.length})</span>
		</span>
		{#if open}
			<ChevronUp class="size-5 text-muted" />
		{:else}
			<ChevronDown class="size-5 text-muted" />
		{/if}
	</button>
	{#if open}
		<div id="trash-list" class="mt-3 flex flex-col gap-3">
			<p class="px-1 text-sm text-muted">{t(messages, 'trashHint', { days: TRASH_DAYS })}</p>
			<ul class="flex flex-col gap-2">
				{#each entries as entry (entry.id)}
					<li
						class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3"
						data-testid="trash-item"
					>
						<div class="min-w-40 grow basis-0">
							<p class="truncate font-bold">{entry.name}</p>
							<p class="text-sm text-muted">{remaining(entry)}</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<Button
								variant="secondary"
								size="sm"
								icon={Undo2}
								onclick={() => onrestore(entry)}
								data-testid="trash-restore"
							>
								{t(messages, 'trashRestore')}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								icon={Trash2}
								class="text-danger"
								onclick={() => onpurge(entry)}
								data-testid="trash-purge"
							>
								{t(messages, 'trashPurge')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
