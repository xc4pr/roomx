<script lang="ts" generics="T extends { id: string }">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { gridColumns, visibleRange } from './virtual.ts';

	interface Props {
		items: readonly T[];
		rowHeight: number;
		minColumn: number;
		gap: number;
		row: Snippet<[T]>;
	}

	let { items, rowHeight, minColumn, gap, row }: Props = $props();

	let host = $state<HTMLElement>();
	let width = $state(0);
	let scrollTop = $state(0);
	let viewport = $state(800);
	let top = $state(0);
	let scroller: HTMLElement | null = null;

	const pitch = $derived(rowHeight + gap);
	const columns = $derived(gridColumns(width, minColumn, gap));
	const range = $derived(
		visibleRange({
			count: items.length,
			columns,
			rowPitch: pitch,
			scrollTop: scrollTop - top,
			viewport
		})
	);
	const shown = $derived(items.slice(range.start, range.end));

	function scrollParent(node: HTMLElement): HTMLElement | null {
		for (let parent = node.parentElement; parent; parent = parent.parentElement) {
			const overflow = getComputedStyle(parent).overflowY;
			if (overflow === 'auto' || overflow === 'scroll') return parent;
		}
		return null;
	}

	function measure(): void {
		if (!host) return;
		width = host.clientWidth;
		if (scroller) {
			viewport = scroller.clientHeight;
			scrollTop = scroller.scrollTop;
			top =
				host.getBoundingClientRect().top -
				scroller.getBoundingClientRect().top +
				scroller.scrollTop;
		} else {
			viewport = window.innerHeight;
			scrollTop = window.scrollY;
			top = host.getBoundingClientRect().top + window.scrollY;
		}
	}

	let frame = 0;
	function schedule(): void {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			measure();
		});
	}

	onMount(() => {
		if (!host) return;
		scroller = scrollParent(host);
		const target: HTMLElement | Window = scroller ?? window;
		target.addEventListener('scroll', schedule, { passive: true });
		const observer = new ResizeObserver(schedule);
		observer.observe(host);
		if (scroller) observer.observe(scroller);
		measure();
		return () => {
			target.removeEventListener('scroll', schedule);
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	});

	$effect(() => {
		void items;
		untrack(() => {
			if (!scroller || !host) return;
			measure();
			if (scrollTop > top) scroller.scrollTop = top;
			schedule();
		});
	});
</script>

<div
	bind:this={host}
	class="relative"
	style:height="{Math.max(0, range.totalRows * pitch - gap)}px"
	data-testid="virtual-grid"
	data-rendered={shown.length}
>
	<div
		class="absolute inset-x-0 grid"
		style:top="{range.offset}px"
		style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
		style:grid-auto-rows="{rowHeight}px"
		style:gap="{gap}px"
	>
		{#each shown as entry (entry.id)}
			{@render row(entry)}
		{/each}
	</div>
</div>
