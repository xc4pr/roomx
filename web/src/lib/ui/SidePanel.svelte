<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { untrack, type Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { WIDE_QUERY } from './layout.ts';
	import { dragPanelWidth, stepPanelWidth } from './panelWidth.ts';
	import { panelLayout } from './panelWidth.svelte.ts';
	import {
		SHEET_FRACTIONS,
		clampFraction,
		nextSnap,
		resolveSnap,
		type SheetSnap
	} from './sheet.ts';

	interface Props {
		open?: boolean;
		snap?: SheetSnap;
		title?: string;
		closeLabel?: string;
		closable?: boolean;
		resizeLabel?: string;
		scrollKey?: string | number;
		class?: string;
		onclose?: () => void;
		children?: Snippet;
		actions?: Snippet;
	}

	let {
		open = $bindable(true),
		snap = $bindable('half'),
		title,
		closeLabel = '×',
		closable = true,
		resizeLabel,
		scrollKey,
		class: extra = '',
		onclose,
		children,
		actions
	}: Props = $props();

	let wide = $state(typeof matchMedia === 'undefined' ? false : matchMedia(WIDE_QUERY).matches);
	let scroller: HTMLElement | undefined = $state();
	let sheet: HTMLElement | undefined = $state();
	let dragFraction = $state<number | null>(null);
	let drag: {
		startY: number;
		startFraction: number;
		parentHeight: number;
		lastY: number;
		lastT: number;
		velocity: number;
		moved: boolean;
	} | null = null;

	const DOUBLE_TAP_MS = 400;
	const RESIZE_SLOP = 3;

	let resize: { pointerId: number; startX: number; startWidth: number; moved: boolean } | null =
		null;
	let lastTap = 0;

	function finishResize(): void {
		resize = null;
		panelLayout.end();
	}

	function onresizedown(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		resize = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startWidth: panelLayout.width,
			moved: false
		};
	}

	function onresizemove(event: PointerEvent): void {
		if (!resize || event.pointerId !== resize.pointerId) return;
		const dx = event.clientX - resize.startX;
		if (!resize.moved) {
			if (Math.abs(dx) < RESIZE_SLOP) return;
			resize.moved = true;
			panelLayout.begin();
		}
		panelLayout.drag(dragPanelWidth(resize.startWidth, dx, innerWidth));
	}

	function onresizeup(event: PointerEvent): void {
		if (!resize || event.pointerId !== resize.pointerId) return;
		const state = resize;
		resize = null;
		if (state.moved) {
			lastTap = 0;
			panelLayout.end();
			return;
		}
		if (event.type !== 'pointerup') return;
		const now = performance.now();
		if (now - lastTap < DOUBLE_TAP_MS) {
			lastTap = 0;
			panelLayout.reset();
		} else {
			lastTap = now;
		}
	}

	function onresizekey(event: KeyboardEvent): void {
		const next = stepPanelWidth(panelLayout.width, event.key, event.shiftKey, innerWidth);
		if (next === null) return;
		event.preventDefault();
		panelLayout.set(next);
	}

	$effect(() => {
		if (!wide && resize) finishResize();
		return () => {
			if (resize) finishResize();
		};
	});

	$effect(() => {
		const query = matchMedia(WIDE_QUERY);
		wide = query.matches;
		const listener = (event: MediaQueryListEvent) => (wide = event.matches);
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});

	let lastKey = untrack(() => scrollKey);
	$effect(() => {
		const key = scrollKey;
		if (key === lastKey) return;
		lastKey = key;
		scroller?.scrollTo({ top: 0 });
	});

	function close(): void {
		open = false;
		onclose?.();
	}

	function onpointerdown(event: PointerEvent): void {
		if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
		const parent = sheet?.offsetParent as HTMLElement | null;
		if (!sheet || !parent) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			startY: event.clientY,
			startFraction: dragFraction ?? SHEET_FRACTIONS[snap],
			parentHeight: parent.clientHeight,
			lastY: event.clientY,
			lastT: performance.now(),
			velocity: 0,
			moved: false
		};
	}

	function onpointermove(event: PointerEvent): void {
		if (!drag) return;
		const dy = event.clientY - drag.startY;
		if (!drag.moved && Math.abs(dy) < 4) return;
		drag.moved = true;
		dragFraction = clampFraction(drag.startFraction - dy / drag.parentHeight);
		const now = performance.now();
		const dt = Math.max(1, now - drag.lastT);
		drag.velocity = (-(event.clientY - drag.lastY) / drag.parentHeight / dt) * 1000;
		drag.lastY = event.clientY;
		drag.lastT = now;
	}

	function onpointerup(): void {
		if (!drag) return;
		const state = drag;
		drag = null;
		if (!state.moved) {
			snap = nextSnap(snap);
			return;
		}
		const result = resolveSnap(dragFraction ?? SHEET_FRACTIONS[snap], state.velocity, closable);
		dragFraction = null;
		if (result === 'close') close();
		else snap = result;
	}

	function onhandlekey(event: KeyboardEvent): void {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const order: SheetSnap[] = ['peek', 'half', 'full'];
		const index = order.indexOf(snap) + (event.key === 'ArrowUp' ? 1 : -1);
		snap = order[Math.min(order.length - 1, Math.max(0, index))];
	}

	const height = $derived((dragFraction ?? SHEET_FRACTIONS[snap]) * 100);
	const width = $derived(panelLayout.width);
	const bounds = $derived(panelLayout.bounds);
</script>

{#snippet headerContent(draggable: boolean)}
	{#if draggable}
		<span class="absolute top-2.5 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-border"
		></span>
	{/if}
	<h2 class="min-w-0 grow truncate text-lg font-bold tracking-tight">{title}</h2>
	{@render actions?.()}
	{#if closable}
		<button
			type="button"
			aria-label={closeLabel}
			data-testid="panel-close"
			class="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition duration-(--duration-fast) ease-soft hover:bg-surface-2 hover:text-text"
			onclick={close}
		>
			<X class="size-5" />
		</button>
	{/if}
{/snippet}

{#snippet header(draggable: boolean)}
	{#if draggable}
		<div
			class="relative flex min-h-16 shrink-0 cursor-grab touch-none items-center gap-2 ps-5 pe-2 pt-5 select-none"
			role="slider"
			tabindex="0"
			aria-label={title}
			aria-orientation="vertical"
			aria-valuemin={0}
			aria-valuemax={2}
			aria-valuenow={['peek', 'half', 'full'].indexOf(snap)}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
			onkeydown={onhandlekey}
		>
			{@render headerContent(true)}
		</div>
	{:else}
		<div
			class="relative flex min-h-14 shrink-0 items-center gap-2 ps-5 pe-2 [@media(max-height:520px)]:min-h-12"
		>
			{@render headerContent(false)}
		</div>
	{/if}
{/snippet}

{#snippet body()}
	<div
		bind:this={scroller}
		class="min-h-0 grow overflow-y-auto overscroll-contain px-5 pt-1 pb-6"
		data-testid="panel-body"
	>
		{@render children?.()}
	</div>
{/snippet}

{#snippet resizer()}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="group absolute inset-y-0 -left-5.5 z-10 flex w-11 cursor-col-resize touch-none items-center justify-center select-none focus-visible:outline-none"
		role="separator"
		tabindex="0"
		aria-orientation="vertical"
		aria-label={resizeLabel ?? t(common, 'resizePanel')}
		aria-valuenow={width}
		aria-valuemin={bounds.min}
		aria-valuemax={bounds.max}
		data-testid="panel-resize"
		onpointerdown={onresizedown}
		onpointermove={onresizemove}
		onpointerup={onresizeup}
		onpointercancel={onresizeup}
		onlostpointercapture={onresizeup}
		onkeydown={onresizekey}
	>
		<span
			class="pointer-events-none h-14 w-1.5 rounded-full transition duration-(--duration-fast) ease-soft {panelLayout.dragging
				? 'bg-accent opacity-100'
				: 'bg-muted opacity-0 group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100 pointer-coarse:opacity-60'}"
		></span>
	</div>
{/snippet}

{#if open}
	{#if wide}
		<aside
			data-sidepanel
			transition:fly={{ x: 28, duration: 220 }}
			style:width="{width}px"
			class="absolute top-3 right-[max(0.75rem,var(--safe-right))] bottom-3 z-20 max-w-[calc(100%-1.5rem)] [@media(max-height:520px)]:top-1.5 [@media(max-height:520px)]:bottom-1.5 {extra}"
		>
			<div
				class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lift"
			>
				{@render header(false)}
				{@render body()}
			</div>
			{@render resizer()}
		</aside>
	{:else}
		<section
			data-sidepanel
			bind:this={sheet}
			transition:fly={{ y: 120, duration: 240 }}
			style:height="{height}%"
			class="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-xl border-t border-border bg-surface pb-safe shadow-lift {dragFraction ===
			null
				? 'transition-[height] duration-(--duration-slow) ease-soft'
				: ''} {extra}"
		>
			{@render header(true)}
			{@render body()}
		</section>
	{/if}
{/if}
