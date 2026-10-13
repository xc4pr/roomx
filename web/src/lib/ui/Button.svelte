<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import ProgressRing from './ProgressRing.svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		icon?: Component<{ class?: string }>;
		href?: string;
		type?: 'button' | 'submit';
		disabled?: boolean;
		loading?: boolean;
		full?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
		'data-testid'?: string;
	}

	let {
		variant = 'secondary',
		size = 'md',
		icon: Icon,
		href,
		type = 'button',
		disabled = false,
		loading = false,
		full = false,
		class: extra = '',
		onclick,
		children,
		'data-testid': testid
	}: Props = $props();

	const sizes = {
		sm: 'min-h-11 px-3.5 text-sm gap-1.5',
		md: 'min-h-12 px-5 text-base gap-2',
		lg: 'min-h-14 px-7 text-lg gap-2.5'
	};
	const variants = {
		primary:
			'bg-accent text-accent-contrast shadow-soft hover:bg-accent-strong active:scale-[0.97]',
		secondary:
			'bg-surface text-text border border-border shadow-soft hover:bg-surface-2 active:scale-[0.97]',
		ghost: 'bg-transparent text-text hover:bg-surface-2 active:bg-surface-2 active:scale-[0.97]',
		danger: 'bg-danger text-accent-contrast shadow-soft hover:opacity-90 active:scale-[0.97]'
	};
	const classes = $derived(
		`inline-flex select-none items-center justify-center rounded-md font-semibold whitespace-nowrap transition duration-(--duration-fast) ease-soft disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 ${sizes[size]} ${variants[variant]} ${full ? 'w-full' : ''} ${extra}`
	);
</script>

{#if href}
	<a {href} class={classes} aria-disabled={disabled || undefined} {onclick} data-testid={testid}>
		{#if Icon}<Icon class="size-5 shrink-0" />{/if}
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		class={classes}
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		{onclick}
		data-testid={testid}
	>
		{#if loading}
			<ProgressRing size={20} stroke={3} />
		{:else if Icon}
			<Icon class="size-5 shrink-0" />
		{/if}
		{@render children?.()}
	</button>
{/if}
