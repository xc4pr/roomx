<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Compass from '@lucide/svelte/icons/compass';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import Settings from '@lucide/svelte/icons/settings';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { LOCAL_ONLY } from '#lib/edition.ts';
	import { openShortcuts } from '#lib/features/settings/shortcuts.svelte.ts';
	import { isTypingTarget } from '#lib/features/settings/shortcuts.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { keyboardLikely } from '#lib/ui/device.ts';
	import { portal } from '#lib/ui/portal.ts';
	import { pickAnchor, scrollDelta, visibleFraction } from './anchor.ts';
	import { intersection, sameRect, type Rect, type Size } from './box.ts';
	import { messages } from './i18n.ts';
	import Illustration from './Illustration.svelte';
	import { placeCard } from './layout.ts';
	import {
		anchorExpected,
		createWaitGate,
		isFirstStep,
		isLastStep,
		progressLabel,
		showTarget,
		stepAt,
		textKey,
		titleKey
	} from './logic.ts';
	import {
		chooseSample,
		currentRoute,
		finishTour,
		nextStep,
		previousStep,
		showCurrentStep,
		skipTour,
		tour
	} from './tour.svelte.ts';
	import { TOUR_AVOID, TOUR_DIALOG_SELECTOR, TOUR_STEPS, TOUR_TOTAL } from './steps.ts';

	const GRACE_MS = 700;
	const ARRIVAL_MS = 4000;
	const RING_PAD = 6;
	const MIN_VISIBLE = 0.5;

	let target = $state<Rect | null>(null);
	let targetStep = $state(-1);
	let avoid = $state<Rect[]>([]);
	let context = $state<Rect | null>(null);
	let viewport = $state<Size>({ width: 0, height: 0 });
	let insets = $state({ top: 0, right: 0, bottom: 0, left: 0 });
	let paused = $state(false);
	let waiting = $state(false);
	let overdue = $state(false);
	const gate = createWaitGate();
	let cardWidth = $state(0);
	let cardHeight = $state(0);
	let card: HTMLElement | undefined = $state();
	let ready = $state(false);
	let focusPending = true;
	let missingSince: number | null = null;
	let arrivingSince: number | null = null;
	let measuredStep = -1;
	let revealed = new Set<HTMLElement>();

	const uid = $props.id();
	const titleId = `tour-title-${uid}`;
	const textId = `tour-text-${uid}`;

	const step = $derived(stepAt(tour.step));
	const route = $derived(currentRoute());
	const centered = $derived(target === null);
	const modal = $derived(centered && !waiting);
	const hidden = $derived(cardWidth === 0 || (waiting && target === null && !overdue));
	const ringVisible = $derived(target !== null && targetStep === tour.step && !waiting);
	const first = $derived(isFirstStep(tour.step));
	const last = $derived(isLastStep(tour.step));
	const keyboard = keyboardLikely();
	const title = $derived(t(messages, titleKey(step.id, LOCAL_ONLY)));
	const text = $derived(t(messages, textKey(step.id, LOCAL_ONLY, keyboard)));
	const guide = $derived(!centered || waiting ? null : showTarget(step, route, tour.sampleId));
	const announcement = $derived(
		t(messages, 'announce', { n: tour.step + 1, total: TOUR_TOTAL, title })
	);

	const placement = $derived(
		cardWidth > 0
			? placeCard({
					card: { width: cardWidth, height: cardHeight },
					viewport,
					insets,
					target,
					context,
					avoid,
					prefer: step.prefer
				})
			: null
	);

	function toRect(box: DOMRect): Rect {
		return { x: box.x, y: box.y, width: box.width, height: box.height };
	}

	function readInsets(): { top: number; right: number; bottom: number; left: number } {
		const probe = document.createElement('div');
		probe.style.cssText =
			'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)';
		document.body.appendChild(probe);
		const style = getComputedStyle(probe);
		const read = {
			top: parseFloat(style.paddingTop) || 0,
			right: parseFloat(style.paddingRight) || 0,
			bottom: parseFloat(style.paddingBottom) || 0,
			left: parseFloat(style.paddingLeft) || 0
		};
		probe.remove();
		return read;
	}

	function exposed(node: HTMLElement, clipped: Rect): boolean {
		const x = clipped.x + clipped.width / 2;
		const y = clipped.y + clipped.height / 2;
		const hit = document.elementsFromPoint(x, y).find((element) => !element.closest('[data-tour]'));
		return !hit || node.contains(hit) || hit.contains(node);
	}

	function scrollParent(node: HTMLElement): HTMLElement | null {
		for (let parent = node.parentElement; parent; parent = parent.parentElement) {
			if (
				/(auto|scroll)/.test(getComputedStyle(parent).overflowY) &&
				parent.scrollHeight > parent.clientHeight
			) {
				return parent;
			}
		}
		return null;
	}

	function bringIntoView(node: HTMLElement): void {
		if (revealed.has(node)) return;
		revealed.add(node);
		const parent = scrollParent(node);
		if (!parent) return;
		const delta = scrollDelta(
			toRect(node.getBoundingClientRect()),
			toRect(parent.getBoundingClientRect())
		);
		if (delta === 0) return;
		const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		parent.scrollTo({ top: parent.scrollTop + delta, behavior: calm ? 'auto' : 'smooth' });
	}

	function measure(): void {
		measureTarget();
		const late = gate.update(waiting);
		if (late !== overdue) overdue = late;
	}

	function measureTarget(): void {
		if (measuredStep !== tour.step) {
			measuredStep = tour.step;
			gate.reset();
			missingSince = null;
			revealed = new Set();
		}
		if (!tour.arriving) arrivingSince = null;
		if (viewport.width !== window.innerWidth || viewport.height !== window.innerHeight) {
			viewport = { width: window.innerWidth, height: window.innerHeight };
		}
		paused = document.querySelector(TOUR_DIALOG_SELECTOR) !== null;
		if (paused) return;
		const current = stepAt(tour.step);
		const nodes = current.anchors.flatMap((selector) => [
			...document.querySelectorAll<HTMLElement>(selector)
		]);
		const lead = nodes.find((node) => node.getBoundingClientRect().height > 0);
		if (
			lead &&
			!revealed.has(lead) &&
			visibleFraction(toRect(lead.getBoundingClientRect()), viewport) < MIN_VISIBLE
		) {
			bringIntoView(lead);
			waiting = true;
			return;
		}
		const picked = pickAnchor(
			nodes.map((node) => ({ item: node, rect: toRect(node.getBoundingClientRect()) })),
			viewport,
			exposed
		);
		if (picked) {
			missingSince = null;
			waiting = false;
			if (!sameRect(target, picked.clipped)) target = picked.clipped;
			if (targetStep !== tour.step) targetStep = tour.step;
			const anchorNode = picked.item;
			const next = TOUR_AVOID.flatMap((selector) => [
				...document.querySelectorAll<HTMLElement>(selector)
			])
				.filter((node) => node !== anchorNode && !anchorNode.contains(node))
				.map((node) => toRect(node.getBoundingClientRect()))
				.filter(
					(box) =>
						box.width > 0 &&
						box.height > 0 &&
						intersection(box, { x: 0, y: 0, width: viewport.width, height: viewport.height })
				);
			if (
				next.length !== avoid.length ||
				next.some((box, index) => !sameRect(box, avoid[index] ?? null))
			) {
				avoid = next;
			}
			const centreX = picked.clipped.x + picked.clipped.width / 2;
			const centreY = picked.clipped.y + picked.clipped.height / 2;
			const holder =
				next.find(
					(box) =>
						centreX >= box.x &&
						centreX <= box.x + box.width &&
						centreY >= box.y &&
						centreY <= box.y + box.height
				) ?? null;
			if (!sameRect(context, holder)) context = holder;
			return;
		}
		if (current.anchors.length === 0) {
			waiting = false;
			target = null;
			context = null;
			avoid = [];
			return;
		}
		const expected = anchorExpected(current, currentRoute(), tour.arriving);
		if (expected) {
			if (tour.arriving) arrivingSince ??= Date.now();
			if (arrivingSince !== null && tour.arriving && Date.now() - arrivingSince < ARRIVAL_MS) {
				missingSince = null;
				waiting = true;
				return;
			}
			missingSince ??= Date.now();
			if (Date.now() - missingSince < GRACE_MS) {
				waiting = true;
				return;
			}
		}
		waiting = false;
		target = null;
		context = null;
		avoid = [];
	}

	$effect(() => {
		void tour.step;
		void tour.arriving;
		void route.screen;
		insets = untrack(readInsets);
		untrack(measure);
		let frame = 0;
		const schedule = (): void => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				measure();
			});
		};
		const timer = setInterval(measure, 200);
		window.addEventListener('resize', schedule);
		window.addEventListener('scroll', schedule, true);
		return () => {
			clearInterval(timer);
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', schedule);
			window.removeEventListener('scroll', schedule, true);
		};
	});

	$effect(() => {
		if (!placement || ready) return;
		const frame = requestAnimationFrame(() => (ready = true));
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		void tour.focusRequest;
		focusPending = true;
	});

	$effect(() => {
		if (!focusPending || paused || hidden || !card) return;
		focusPending = false;
		const host = card;
		void tick().then(() =>
			requestAnimationFrame(() => {
				if (host.contains(document.activeElement)) return;
				host
					.querySelector<HTMLElement>(
						'[data-testid="guide-next"], [data-testid="guide-sample-yes"]'
					)
					?.focus({ preventScroll: true });
			})
		);
	});

	function onkeydown(event: KeyboardEvent): void {
		if (paused || hidden || !card) return;
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		const inside = card.contains(document.activeElement);
		if (event.key === 'Tab' && modal) {
			const controls = [...card.querySelectorAll<HTMLElement>('button:not([disabled])')];
			const end = controls.at(-1);
			const start = controls[0];
			if (!start || !end) return;
			const active = document.activeElement;
			if (event.shiftKey && (active === start || !inside)) {
				event.preventDefault();
				end.focus();
			} else if (!event.shiftKey && (active === end || !inside)) {
				event.preventDefault();
				start.focus();
			}
			return;
		}
		if (!inside && !modal) return;
		if (!inside && isTypingTarget(event.target)) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			skipTour();
		} else if (event.key === 'ArrowRight' && !(step.extra === 'sample')) {
			event.preventDefault();
			nextStep();
		} else if (event.key === 'ArrowLeft' && !first) {
			event.preventDefault();
			previousStep();
		}
	}

	function openSettings(): void {
		finishTour();
		void goto(resolve('/settings'));
	}
</script>

<svelte:window {onkeydown} />

<div use:portal data-tour class="pointer-events-none fixed inset-0 z-60 overflow-hidden">
	<p class="sr-only" role="status" aria-live="polite">{announcement}</p>

	{#if !paused}
		{#if modal}
			<div
				data-tour-scrim
				aria-hidden="true"
				class="pointer-events-auto absolute inset-0 animate-fade-in bg-scrim"
			></div>
		{/if}

		{#if ringVisible && target}
			<span
				aria-hidden="true"
				class="tour-ring absolute rounded-xl border-2 border-accent"
				data-testid="guide-ring"
				style:left="{target.x - RING_PAD}px"
				style:top="{target.y - RING_PAD}px"
				style:width="{target.width + RING_PAD * 2}px"
				style:height="{target.height + RING_PAD * 2}px"
			></span>
		{/if}

		<div
			class="tour-slot absolute top-0 left-0 {hidden ? 'invisible opacity-0' : 'opacity-100'} {ready
				? 'tour-animated'
				: ''}"
			style:transform="translate({placement?.left ?? 0}px, {placement?.top ?? 0}px)"
		>
			<div
				bind:this={card}
				bind:clientWidth={cardWidth}
				bind:clientHeight={cardHeight}
				role="dialog"
				aria-modal={modal}
				aria-labelledby={titleId}
				aria-describedby={textId}
				tabindex="-1"
				data-tour-card
				data-testid="guide-card"
				class="pointer-events-auto flex max-h-[calc(100dvh-1.5rem)] animate-pop-in flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-5 shadow-float outline-none [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:p-4 {centered
					? 'w-[min(28rem,calc(100vw-1.5rem))]'
					: 'w-[min(24rem,calc(100vw-1.5rem))]'}"
			>
				<div class="flex items-center gap-3">
					<p
						class="text-xs font-bold tracking-wide text-accent tabular-nums pointer-coarse:text-sm"
						data-testid="guide-progress"
					>
						{progressLabel(tour.step)}
					</p>
					<div class="flex grow gap-1" aria-hidden="true">
						{#each TOUR_STEPS as marker, index (marker.id)}
							<span
								class="h-1 grow rounded-full transition-colors duration-(--duration-base) ease-soft {index <=
								tour.step
									? 'bg-accent'
									: 'bg-border'}"
							></span>
						{/each}
					</div>
				</div>

				{#key tour.step}
					<div class="flex animate-fade-in flex-col gap-3">
						{#if centered}
							<div class="rounded-lg bg-accent-soft px-4 py-3 [@media(max-height:520px)]:hidden">
								<div class="mx-auto max-h-40 w-full max-w-72">
									<Illustration id={step.id} />
								</div>
							</div>
						{/if}
						<div>
							<h2 id={titleId} class="text-xl font-extrabold tracking-tight">{title}</h2>
							<p id={textId} class="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{text}</p>
							{#if step.extra === 'sample'}
								<p
									class="mt-2 text-sm leading-relaxed text-muted [@media(max-height:520px)]:hidden"
								>
									{t(messages, 'sampleHint')}
								</p>
							{/if}
						</div>
					</div>
				{/key}

				{#if guide}
					<div>
						<Button
							variant="secondary"
							size="sm"
							icon={Compass}
							onclick={showCurrentStep}
							data-testid="guide-show"
						>
							{t(messages, 'showMe')}
						</Button>
					</div>
				{/if}

				{#if step.extra === 'shortcuts'}
					<div class="-mx-1 flex flex-wrap gap-1">
						{#if keyboard}
							<Button
								variant="ghost"
								size="sm"
								icon={Keyboard}
								onclick={openShortcuts}
								data-testid="guide-shortcuts"
							>
								{t(messages, 'shortcutsAction')}
							</Button>
						{/if}
						<Button
							variant="ghost"
							size="sm"
							icon={Settings}
							onclick={openSettings}
							data-testid="guide-settings"
						>
							{t(messages, 'settingsAction')}
						</Button>
					</div>
				{/if}

				{#if step.extra === 'sample'}
					<div class="flex flex-col gap-2">
						<Button
							variant="primary"
							full
							icon={Sparkles}
							loading={tour.busy}
							onclick={() => void chooseSample(true)}
							data-testid="guide-sample-yes"
						>
							{t(messages, 'sampleYes')}
						</Button>
						<Button
							variant="secondary"
							full
							disabled={tour.busy}
							onclick={() => void chooseSample(false)}
							data-testid="guide-sample-no"
						>
							{t(messages, 'sampleNo')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							full
							class="text-muted"
							onclick={skipTour}
							data-testid="guide-skip"
						>
							{t(messages, 'skip')}
						</Button>
					</div>
				{:else}
					<div class="flex items-center justify-between gap-2">
						{#if last}
							<span></span>
						{:else}
							<Button
								variant="ghost"
								size="sm"
								class="-ml-2 text-muted"
								onclick={skipTour}
								data-testid="guide-skip"
							>
								{t(messages, 'skip')}
							</Button>
						{/if}
						<div class="flex items-center gap-2">
							{#if !first}
								<IconButton
									icon={ChevronLeft}
									label={t(messages, 'back')}
									variant="secondary"
									onclick={previousStep}
									data-testid="guide-back"
								/>
							{/if}
							<Button variant="primary" size="sm" onclick={nextStep} data-testid="guide-next">
								{last ? t(messages, 'finish') : t(messages, 'next')}
							</Button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.tour-ring {
		box-shadow: 0 0 0 100vmax var(--color-scrim);
		transition:
			left var(--duration-base) var(--ease-soft),
			top var(--duration-base) var(--ease-soft),
			width var(--duration-base) var(--ease-soft),
			height var(--duration-base) var(--ease-soft);
	}
	.tour-ring::after {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: inherit;
		animation: tour-pulse 1.8s ease-out infinite;
	}
	.tour-animated {
		transition:
			transform var(--duration-base) var(--ease-soft),
			opacity var(--duration-base) var(--ease-soft),
			visibility var(--duration-base) var(--ease-soft);
	}
	@keyframes tour-pulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 45%, transparent);
		}
		70%,
		100% {
			box-shadow: 0 0 0 12px transparent;
		}
	}
</style>
