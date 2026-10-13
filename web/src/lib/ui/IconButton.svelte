<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component<{ class?: string }>;
		label: string;
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'md' | 'lg';
		pressed?: boolean;
		href?: string;
		disabled?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		'data-testid'?: string;
	}

	let {
		icon: Icon,
		label,
		variant = 'ghost',
		size = 'md',
		pressed,
		href,
		disabled = false,
		class: extra = '',
		onclick,
		'data-testid': testid
	}: Props = $props();

	const variants = {
		primary: 'bg-accent text-accent-contrast shadow-soft hover:bg-accent-strong',
		secondary: 'bg-surface text-text border border-border shadow-soft hover:bg-surface-2',
		ghost: 'bg-transparent text-text hover:bg-surface-2',
		danger: 'bg-transparent text-danger hover:bg-danger-soft'
	};
	const classes = $derived(
		`inline-flex shrink-0 select-none items-center justify-center rounded-full transition duration-(--duration-fast) ease-soft active:scale-90 disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 ${size === 'lg' ? 'size-14' : 'size-11'} ${pressed ? 'bg-accent-soft text-accent' : variants[variant]} ${extra}`
	);
</script>

{#if href}
	<a
		{href}
		class={classes}
		aria-label={label}
		title={label}
		aria-disabled={disabled || undefined}
		{onclick}
		data-testid={testid}
	>
		<Icon class={size === 'lg' ? 'size-7' : 'size-5'} />
	</a>
{:else}
	<button
		type="button"
		class={classes}
		aria-label={label}
		title={label}
		aria-pressed={pressed}
		{disabled}
		{onclick}
		data-testid={testid}
	>
		<Icon class={size === 'lg' ? 'size-7' : 'size-5'} />
	</button>
{/if}
