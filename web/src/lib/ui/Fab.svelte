<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { Component } from 'svelte';

	interface Props {
		label: string;
		icon?: Component<{ class?: string }>;
		extended?: boolean;
		position?: 'fixed' | 'absolute';
		class?: string;
		onclick?: (event: MouseEvent) => void;
		'data-testid'?: string;
	}

	let {
		label,
		icon: Icon = Plus,
		extended = false,
		position = 'fixed',
		class: extra = '',
		onclick,
		'data-testid': testid
	}: Props = $props();
</script>

<button
	type="button"
	aria-label={extended ? undefined : label}
	title={label}
	{onclick}
	data-testid={testid}
	style:right="max(1.25rem, var(--safe-right))"
	style:bottom="max(1.25rem, var(--safe-bottom))"
	class="{position} z-30 inline-flex h-16 items-center justify-center gap-2.5 rounded-full bg-accent text-accent-contrast shadow-float transition duration-(--duration-base) ease-spring select-none hover:bg-accent-strong active:scale-90 {extended
		? 'px-7 text-lg font-bold'
		: 'w-16'} {extra}"
>
	<Icon class="size-7 shrink-0" />
	{#if extended}{label}{/if}
</button>
