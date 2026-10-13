<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import type { Component, Snippet } from 'svelte';

	interface Props {
		selected?: boolean;
		icon?: Component<{ class?: string }>;
		disabled?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
		'data-testid'?: string;
	}

	let {
		selected = false,
		icon: Icon,
		disabled = false,
		class: extra = '',
		onclick,
		children,
		'data-testid': testid
	}: Props = $props();
</script>

<button
	type="button"
	aria-pressed={selected}
	{disabled}
	{onclick}
	data-testid={testid}
	class="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition duration-(--duration-fast) ease-soft select-none active:scale-95 disabled:pointer-events-none disabled:opacity-40 {selected
		? 'border-accent bg-accent-soft text-accent'
		: 'border-border bg-surface text-text hover:bg-surface-2'} {extra}"
>
	{#if selected}
		<Check class="size-4 shrink-0" />
	{:else if Icon}
		<Icon class="size-4 shrink-0" />
	{/if}
	{@render children?.()}
</button>
