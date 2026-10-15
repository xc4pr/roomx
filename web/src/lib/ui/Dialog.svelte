<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		closeLabel?: string;
		size?: 'sm' | 'md' | 'lg';
		dismissible?: boolean;
		class?: string;
		onclose?: () => void;
		children?: Snippet;
		actions?: Snippet;
	}

	let {
		open = $bindable(false),
		title,
		description,
		closeLabel = '×',
		size = 'md',
		dismissible = true,
		class: extra = '',
		onclose,
		children,
		actions
	}: Props = $props();

	const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onclose?.();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
		/>
		<Dialog.Content
			interactOutsideBehavior={dismissible ? 'close' : 'ignore'}
			escapeKeydownBehavior={dismissible ? 'close' : 'ignore'}
			class="fixed top-[calc((100dvh-var(--kb,0px))/2)] left-1/2 z-50 flex max-h-[min(88dvh,46rem,calc(100dvh-var(--kb,0px)-1rem))] w-[min(calc(100vw-2rem),100%)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface p-5 shadow-lift outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in sm:p-6 [@media(max-height:520px)]:p-4 {widths[
				size
			]} {extra}"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<Dialog.Title class="text-xl font-bold tracking-tight">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description class="mt-1.5 text-base text-muted"
							>{description}</Dialog.Description
						>
					{/if}
				</div>
				{#if dismissible}
					<Dialog.Close
						aria-label={closeLabel}
						class="-me-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition duration-(--duration-fast) ease-soft hover:bg-surface-2 hover:text-text"
					>
						<X class="size-5" />
					</Dialog.Close>
				{/if}
			</div>
			{#if children}
				<div class="mt-4 min-h-0 overflow-y-auto sm:mt-5">
					{@render children()}
				</div>
			{/if}
			{#if actions}
				<div class="mt-5 flex flex-wrap justify-end gap-2 sm:mt-6">
					{@render actions()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
