<script lang="ts">
	import Compass from '@lucide/svelte/icons/compass';
	import { startTour } from '#lib/features/tour/tour.svelte.ts';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { messages } from './i18n.ts';
	import { SHORTCUT_GROUPS, isApplePlatform, isTypingTarget, type KeyToken } from './shortcuts.ts';
	import { shortcuts } from './shortcuts.svelte.ts';

	const apple = $derived(
		typeof navigator !== 'undefined' &&
			isApplePlatform(navigator.platform ?? '', navigator.maxTouchPoints)
	);

	function keyLabel(token: KeyToken): string {
		switch (token) {
			case 'mod':
				return apple ? '⌘' : t(messages, 'keyCtrl');
			case 'shift':
				return apple ? '⇧' : t(messages, 'keyShift');
			case 'esc':
				return 'Esc';
			case 'del':
				return apple ? '⌫' : t(messages, 'keyDelete');
			case 'arrows':
				return '← ↑ ↓ →';
			default:
				return token;
		}
	}

	function beginTour(): void {
		shortcuts.open = false;
		startTour();
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
		if (isTypingTarget(event.target) || event.defaultPrevented) return;
		event.preventDefault();
		shortcuts.open = !shortcuts.open;
	}
</script>

<svelte:window {onkeydown} />

<Dialog
	bind:open={shortcuts.open}
	title={t(messages, 'shortcutsTitle')}
	description={t(messages, 'shortcutsHint')}
	closeLabel={t(common, 'close')}
	size="md"
>
	<div class="flex flex-col gap-6" data-testid="shortcuts-list">
		{#each SHORTCUT_GROUPS as group (group.id)}
			<section class="flex flex-col gap-1">
				<h3 class="px-1 text-xs font-bold tracking-wide text-muted uppercase">
					{t(messages, `shortcutGroup_${group.id}`)}
				</h3>
				<dl class="flex flex-col">
					{#each group.entries as entry (entry.id)}
						<div
							class="flex min-h-11 items-center justify-between gap-4 rounded-md px-1 py-1.5 odd:bg-surface-2/60"
						>
							<dt class="min-w-0 text-sm font-medium">
								{t(messages, `shortcut_${entry.id}`)}
							</dt>
							<dd class="flex shrink-0 items-center gap-2">
								{#each entry.keys as combo, index (index)}
									{#if index > 0}<span class="text-xs text-muted">/</span>{/if}
									<span class="flex items-center gap-1">
										{#each combo as token (token)}
											<kbd
												class="inline-flex min-h-7 min-w-7 items-center justify-center rounded-sm border border-border bg-surface px-1.5 font-sans text-xs font-bold shadow-soft"
											>
												{keyLabel(token)}
											</kbd>
										{/each}
									</span>
								{/each}
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
	{#snippet actions()}
		<Button variant="secondary" icon={Compass} onclick={beginTour} data-testid="shortcuts-tour">
			{t(messages, 'startTour')}
		</Button>
	{/snippet}
</Dialog>
