<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { toasts, type ToastKind } from './toast.svelte.ts';

	interface Props {
		closeLabel?: string;
	}

	let { closeLabel = '×' }: Props = $props();

	let narrow = $state(false);
	let headerBottom = $state<number | null>(null);

	$effect(() => {
		const query = matchMedia('(max-width: 639px)');
		narrow = query.matches;
		const listener = (event: MediaQueryListEvent) => (narrow = event.matches);
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});

	$effect(() => {
		void toasts.items.length;
		const header = document.querySelector('[data-app-header]');
		headerBottom = header ? header.getBoundingClientRect().bottom : null;
	});

	const onTop = $derived(narrow && headerBottom !== null);

	const icons = { info: Info, success: CircleCheck, error: CircleAlert } satisfies Record<
		ToastKind,
		unknown
	>;
	const tones: Record<ToastKind, string> = {
		info: 'text-muted',
		success: 'text-accent',
		error: 'text-danger'
	};
</script>

<div
	class="pointer-events-none fixed inset-x-0 z-70 flex items-center gap-2 px-4 {onTop
		? 'flex-col'
		: 'bottom-0 flex-col'} {narrow && !onTop
		? 'pb-[max(6.5rem,calc(var(--safe-bottom)+6rem))]'
		: 'pb-[max(1rem,var(--safe-bottom))]'}"
	style:top={onTop ? `${(headerBottom ?? 0) + 8}px` : undefined}
	role="region"
	aria-live="polite"
>
	{#each toasts.items as toast (toast.id)}
		{@const Icon = icons[toast.kind]}
		<div
			animate:flip={{ duration: 200 }}
			in:fly={{ y: onTop ? -24 : 24, duration: 220 }}
			out:fly={{ y: onTop ? -16 : 16, duration: 160 }}
			role={toast.kind === 'error' ? 'alert' : 'status'}
			data-testid="toast"
			class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-border py-2 ps-4 pe-2 shadow-lift surface-glass"
		>
			<Icon class="size-5 shrink-0 {tones[toast.kind]}" />
			<p class="min-w-0 grow py-2 text-sm font-medium">{toast.message}</p>
			{#if toast.actionLabel}
				<button
					type="button"
					class="min-h-11 shrink-0 rounded-md px-3 text-sm font-bold text-accent transition duration-(--duration-fast) ease-soft hover:bg-accent-soft"
					onclick={() => {
						toast.onaction?.();
						toasts.dismiss(toast.id);
					}}
				>
					{toast.actionLabel}
				</button>
			{/if}
			<button
				type="button"
				aria-label={closeLabel}
				class="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition duration-(--duration-fast) ease-soft hover:bg-surface-2"
				onclick={() => toasts.dismiss(toast.id)}
			>
				<X class="size-4" />
			</button>
		</div>
	{/each}
</div>
