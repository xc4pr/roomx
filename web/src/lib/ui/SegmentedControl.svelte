<script lang="ts" module>
	import type { Component } from 'svelte';

	export interface SegmentItem {
		value: string;
		label: string;
		icon?: Component<{ class?: string }>;
		href?: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	interface Props {
		items: SegmentItem[];
		value?: string;
		label?: string;
		size?: 'md' | 'lg';
		collapse?: boolean;
		full?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	}

	let {
		items,
		value = $bindable(),
		label,
		size = 'md',
		collapse = false,
		full = false,
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
		const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
		if (!keys.includes(event.key) || !root) return;
		const enabled = items.filter((item) => !item.disabled && !item.href);
		if (enabled.length === 0) return;
		const index = enabled.findIndex((item) => item.value === value);
		const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
		const next = enabled[(index + (forward ? 1 : -1) + enabled.length) % enabled.length];
		event.preventDefault();
		select(next.value);
		requestAnimationFrame(() => root?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
	}

	const base = $derived(
		`inline-flex select-none items-center justify-center gap-2 rounded-full ${full ? 'px-2 sm:px-4' : 'px-4'} font-semibold whitespace-nowrap transition duration-(--duration-base) ease-soft ${size === 'lg' ? 'min-h-12 text-base' : 'min-h-11 text-sm'}`
	);
	const on = 'bg-surface text-text shadow-soft';
	const off = 'text-muted hover:text-text';
</script>

<div
	bind:this={root}
	role={items.some((item) => item.href) ? undefined : 'radiogroup'}
	aria-label={label}
	class="inline-flex gap-1 rounded-full bg-surface-2 p-1 {full ? 'flex w-full' : ''} {extra}"
>
	{#each items as item (item.value)}
		{@const active = item.value === value}
		{#if item.href}
			<a
				href={item.href}
				data-testid="seg-{item.value}"
				class="{base} {full ? 'grow' : ''} {active ? on : off}"
				aria-current={active ? 'page' : undefined}
				aria-label={collapse ? item.label : undefined}
				title={collapse ? item.label : undefined}
			>
				{#if item.icon}<item.icon class="size-5 shrink-0" />{/if}
				<span class={collapse && item.icon ? 'max-sm:hidden md:max-lg:hidden' : ''}
					>{item.label}</span
				>
			</a>
		{:else}
			<button
				type="button"
				role="radio"
				data-testid="seg-{item.value}"
				aria-checked={active}
				aria-label={collapse ? item.label : undefined}
				title={collapse ? item.label : undefined}
				tabindex={active || value === undefined ? 0 : -1}
				disabled={item.disabled}
				class="{base} {full ? 'grow' : ''} {active ? on : off} disabled:opacity-40"
				onclick={() => select(item.value)}
				{onkeydown}
			>
				{#if item.icon}<item.icon class="size-5 shrink-0" />{/if}
				<span class={collapse && item.icon ? 'max-sm:hidden md:max-lg:hidden' : ''}
					>{item.label}</span
				>
			</button>
		{/if}
	{/each}
</div>
