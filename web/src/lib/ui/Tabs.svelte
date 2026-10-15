<script lang="ts" module>
	import type { Component } from 'svelte';

	export interface TabItem {
		value: string;
		label: string;
		icon?: Component<{ class?: string }>;
		badge?: string | number;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	interface Props {
		items: TabItem[];
		value?: string;
		label?: string;
		full?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	}

	let {
		items,
		value = $bindable(),
		label,
		full = true,
		class: extra = '',
		onchange
	}: Props = $props();

	let root: HTMLElement | undefined = $state();

	function select(next: string): void {
		if (next === value) return;
		value = next;
		onchange?.(next);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		const enabled = items.filter((item) => !item.disabled);
		if (enabled.length === 0) return;
		const index = enabled.findIndex((item) => item.value === value);
		let target = index;
		if (event.key === 'ArrowRight') target = (index + 1) % enabled.length;
		else if (event.key === 'ArrowLeft') target = (index - 1 + enabled.length) % enabled.length;
		else if (event.key === 'Home') target = 0;
		else target = enabled.length - 1;
		event.preventDefault();
		select(enabled[target].value);
		requestAnimationFrame(() =>
			root?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
		);
	}
</script>

<div
	bind:this={root}
	role="tablist"
	aria-label={label}
	class="no-scrollbar flex gap-1 overflow-x-auto border-b border-border {extra}"
>
	{#each items as item (item.value)}
		{@const active = item.value === value}
		<button
			type="button"
			role="tab"
			data-testid="tab-{item.value}"
			aria-selected={active}
			tabindex={active ? 0 : -1}
			disabled={item.disabled}
			class="relative inline-flex min-h-11 items-center justify-center gap-1.5 px-1 text-sm font-semibold whitespace-nowrap transition duration-(--duration-base) ease-soft select-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:transition-transform after:duration-(--duration-base) after:ease-soft disabled:opacity-40 min-[400px]:gap-2 min-[400px]:px-4 {full
				? 'grow'
				: ''} {active
				? 'text-accent after:scale-x-100'
				: 'text-muted after:scale-x-0 hover:text-text'}"
			onclick={() => select(item.value)}
			{onkeydown}
		>
			{#if item.icon}<item.icon class="size-5 shrink-0" />{/if}
			{item.label}
			{#if item.badge !== undefined}
				<span class="rounded-full bg-surface-2 px-1.5 text-xs text-muted pointer-coarse:text-sm"
					>{item.badge}</span
				>
			{/if}
		</button>
	{/each}
</div>
