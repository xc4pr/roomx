<script lang="ts" module>
	import type { Component } from 'svelte';

	export interface BottomNavItem {
		value: string;
		label: string;
		short?: string;
		icon: Component<{ class?: string }>;
		href: string;
	}
</script>

<script lang="ts">
	interface Props {
		items: BottomNavItem[];
		value?: string;
		label?: string;
		class?: string;
	}

	let { items, value, label, class: extra = '' }: Props = $props();
</script>

<nav
	aria-label={label}
	data-bottom-nav
	class="flex shrink-0 border-t border-border pr-safe pb-safe pl-safe surface-glass {extra}"
>
	{#each items as item (item.value)}
		{@const active = item.value === value}
		<a
			href={item.href}
			data-testid="seg-{item.value}"
			aria-current={active ? 'page' : undefined}
			aria-label={item.label}
			class="flex min-h-14 min-w-0 grow basis-0 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 text-sm font-semibold transition duration-(--duration-base) ease-soft select-none {active
				? 'text-accent'
				: 'text-muted active:text-text'}"
		>
			<span
				class="flex h-7 w-14 items-center justify-center rounded-full transition duration-(--duration-base) ease-soft {active
					? 'bg-accent-soft'
					: ''}"
			>
				<item.icon class="size-5" />
			</span>
			<span class="max-w-full truncate leading-tight">{item.short ?? item.label}</span>
		</a>
	{/each}
</nav>
