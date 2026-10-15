<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Sofa from '@lucide/svelte/icons/sofa';
	import type { CatalogEntry } from '#lib/core/catalog.ts';
	import { formatChf, lengthValue } from '#lib/core/units.ts';
	import { locale, pick, t } from '#lib/i18n/index.svelte.ts';
	import { externalLink } from '#lib/security/url.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { WIDE_QUERY } from '#lib/ui/layout.ts';
	import { messages } from './i18n.ts';
	import { pricesAsOf } from './priceDate.ts';
	import { session } from './session.svelte.ts';
	import { lazyThumbnail } from './thumbs.ts';

	interface Props {
		entry: CatalogEntry;
		onadd: (entry: CatalogEntry) => void;
		ondrop: (entry: CatalogEntry, x: number, y: number, over: 'board' | 'viewer' | null) => void;
	}

	let { entry, onadd, ondrop }: Props = $props();

	const HOLD_MS = 240;

	let url = $state<string | null>(null);
	let press: {
		pointerId: number;
		x: number;
		y: number;
		touch: boolean;
		active: boolean;
		timer: ReturnType<typeof setTimeout> | undefined;
	} | null = null;
	let suppress = false;

	const dims = $derived(
		[entry.dims.w, entry.dims.d, entry.dims.h]
			.map((mm) => lengthValue(mm, settings.unit, locale.language))
			.join(' × ') + ` ${settings.unit}`
	);
	const link = $derived(externalLink(entry.url));
	const price = $derived(
		entry.priceChf === undefined
			? t(messages, 'priceOpen')
			: `${entry.verified ? '' : `${t(messages, 'approx')} `}${formatChf(entry.priceChf, locale.language)}`
	);

	function overOf(x: number, y: number): 'board' | 'viewer' | null {
		const hit = document.elementFromPoint(x, y);
		if (hit?.closest('[data-furnish-board]')) return 'board';
		if (hit?.closest('[data-furnish-viewer]')) return 'viewer';
		return null;
	}

	function lift(touch: boolean): number {
		return touch ? 56 : 0;
	}

	function track(x: number, y: number): void {
		if (!session.drag || !press) return;
		const top = y - lift(press.touch);
		session.drag.px = x;
		session.drag.py = y;
		session.drag.x = x;
		session.drag.y = top;
		session.drag.over = overOf(x, top);
	}

	function begin(x: number, y: number): void {
		if (!press || press.active) return;
		press.active = true;
		clearTimeout(press.timer);
		session.drag = { entry, x, y, px: x, py: y, over: null };
		track(x, y);
		if (!matchMedia(WIDE_QUERY).matches) {
			session.snap = 'peek';
		}
		navigator.vibrate?.(12);
		window.addEventListener('touchmove', stopScroll, { passive: false });
	}

	function stopScroll(event: TouchEvent): void {
		if (event.cancelable) event.preventDefault();
	}

	function end(): void {
		if (press) clearTimeout(press.timer);
		press = null;
		window.removeEventListener('touchmove', stopScroll);
	}

	function down(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		end();
		const touch = event.pointerType !== 'mouse';
		press = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			touch,
			active: false,
			timer: undefined
		};
		if (touch) {
			const x = event.clientX;
			const y = event.clientY;
			press.timer = setTimeout(() => begin(press?.x ?? x, press?.y ?? y), HOLD_MS);
		} else {
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
		}
	}

	function move(event: PointerEvent): void {
		if (!press || event.pointerId !== press.pointerId) return;
		if (!press.active) {
			const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
			if (press.touch) {
				if (moved > 10) end();
				return;
			}
			if (moved < 6) return;
			begin(event.clientX, event.clientY);
		}
		track(event.clientX, event.clientY);
	}

	function up(event: PointerEvent): void {
		if (!press || event.pointerId !== press.pointerId) return;
		const wasActive = press.active;
		end();
		if (!wasActive) return;
		suppress = true;
		setTimeout(() => (suppress = false), 60);
		const spot = session.drag;
		session.drag = null;
		if (event.type === 'pointerup' && spot) ondrop(entry, spot.x, spot.y, spot.over);
	}

	function click(): void {
		if (suppress) return;
		onadd(entry);
	}
</script>

<div
	class="flex min-w-0 flex-col rounded-lg border border-border bg-surface transition duration-(--duration-fast) ease-soft hover:bg-surface-2 {session
		.drag?.entry.id === entry.id
		? 'opacity-50'
		: ''}"
>
	<button
		type="button"
		class="group flex min-w-0 flex-col gap-1.5 rounded-lg p-2 text-start select-none active:scale-[0.97]"
		style="touch-action: pan-y; -webkit-touch-callout: none; user-select: none"
		data-catalog-id={entry.id}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		oncontextmenu={(event) => event.preventDefault()}
		onclick={click}
	>
		<span
			class="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-surface-2"
			use:lazyThumbnail={{ entry, onload: (next) => (url = next) }}
		>
			{#if url}
				<img
					src={url}
					alt=""
					draggable="false"
					class="size-full animate-fade-in object-contain p-1"
					style="-webkit-user-drag: none"
				/>
			{:else}
				<Sofa class="size-7 animate-pulse text-border" />
			{/if}
		</span>
		<span
			class="line-clamp-2 min-h-[2.5em] text-[13px] leading-tight font-semibold pointer-coarse:text-sm"
		>
			{pick(entry.name)}
		</span>
		<span class="truncate text-[11px] text-muted tabular-nums pointer-coarse:text-sm">{dims}</span>
		{#if !entry.verified}
			<span
				class="flex items-center gap-1.5 text-[11px] text-muted pointer-coarse:text-sm"
				title={t(messages, 'unverifiedHint')}
				data-testid="unverified"
			>
				<span class="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true"></span>
				<span class="truncate">{t(messages, 'unverified')}</span>
			</span>
		{/if}
		<span class="flex items-center justify-between gap-1 text-xs pointer-coarse:text-sm">
			<span
				class="truncate font-bold tabular-nums"
				title={t(messages, 'priceDate', { date: pricesAsOf() })}>{price}</span
			>
			<span class="truncate text-[10px] text-muted pointer-coarse:text-sm"
				>{entry.series ?? entry.brand}</span
			>
		</span>
	</button>
	{#if link}
		<a
			{...link}
			class="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-accent pointer-coarse:text-sm"
			data-testid="catalog-link"
			onpointerdown={(event) => event.stopPropagation()}
			onpointerup={(event) => event.stopPropagation()}
			onclick={(event) => event.stopPropagation()}
		>
			<span class="truncate">{t(messages, 'viewAtRetailer')}</span>
			<ExternalLink class="size-3.5 shrink-0" />
		</a>
	{/if}
</div>
