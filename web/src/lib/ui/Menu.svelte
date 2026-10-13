<script lang="ts" module>
	import type { Component } from 'svelte';

	export interface MenuItem {
		label: string;
		icon?: Component<{ class?: string }>;
		danger?: boolean;
		disabled?: boolean;
		separatorBefore?: boolean;
		onselect: () => void;
	}
</script>

<script lang="ts">
	import { portal } from './portal.ts';

	interface Props {
		open?: boolean;
		x?: number;
		y?: number;
		items: MenuItem[];
		label?: string;
		onclose?: () => void;
	}

	let { open = $bindable(false), x = 0, y = 0, items, label, onclose }: Props = $props();

	let menu: HTMLElement | undefined = $state();
	let width = $state(0);
	let height = $state(0);
	let previous: HTMLElement | null = null;

	const margin = 8;
	const left = $derived(Math.max(margin, Math.min(x, innerWidth - width - margin)));
	const top = $derived(Math.max(margin, Math.min(y, innerHeight - height - margin)));

	function close(): void {
		if (!open) return;
		open = false;
		onclose?.();
	}

	$effect(() => {
		if (!open) return;
		previous = document.activeElement as HTMLElement | null;
		requestAnimationFrame(() =>
			menu?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
		);
		const onpointerdown = (event: PointerEvent) => {
			if (!menu?.contains(event.target as Node)) close();
		};
		const onscroll = () => close();
		window.addEventListener('pointerdown', onpointerdown, true);
		window.addEventListener('scroll', onscroll, true);
		window.addEventListener('resize', onscroll);
		return () => {
			window.removeEventListener('pointerdown', onpointerdown, true);
			window.removeEventListener('scroll', onscroll, true);
			window.removeEventListener('resize', onscroll);
			previous?.focus?.();
		};
	});

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		const move = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
		if (move === 0 || !menu) return;
		event.preventDefault();
		const buttons = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
		const index = buttons.indexOf(document.activeElement as HTMLElement);
		buttons[(index + move + buttons.length) % buttons.length]?.focus();
	}

	function choose(item: MenuItem): void {
		close();
		item.onselect();
	}
</script>

{#if open}
	<div
		use:portal
		bind:this={menu}
		bind:offsetWidth={width}
		bind:offsetHeight={height}
		role="menu"
		tabindex="-1"
		aria-label={label}
		{onkeydown}
		oncontextmenu={(event) => event.preventDefault()}
		style:left="{left}px"
		style:top="{top}px"
		class="fixed z-60 min-w-52 animate-rise-in rounded-lg border border-border bg-surface p-1.5 shadow-lift"
	>
		{#each items as item, index (index)}
			{#if item.separatorBefore && index > 0}
				<div class="my-1 h-px bg-border" role="separator"></div>
			{/if}
			<button
				type="button"
				role="menuitem"
				disabled={item.disabled}
				onclick={() => choose(item)}
				class="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-base font-medium transition duration-(--duration-fast) ease-soft hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-40 {item.danger
					? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
					: ''}"
			>
				{#if item.icon}<item.icon class="size-5 shrink-0" />{/if}
				{item.label}
			</button>
		{/each}
	</div>
{/if}
