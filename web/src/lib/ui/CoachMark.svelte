<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { portal } from './portal.ts';
	import { placeBubble, type Box, type Side } from './placement.ts';

	interface Props {
		anchor: string;
		prefer?: Side[];
		avoid?: string;
		title: string;
		text: string;
		progress?: string;
		nextLabel: string;
		skipLabel: string;
		onnext: () => void;
		onskip: () => void;
	}

	let {
		anchor,
		prefer,
		avoid,
		title,
		text,
		progress,
		nextLabel,
		skipLabel,
		onnext,
		onskip
	}: Props = $props();

	let target = $state<Box | null>(null);
	let avoidBoxes = $state<Box[]>([]);
	let bubbleWidth = $state(0);
	let bubbleHeight = $state(0);
	let viewport = $state({ width: 0, height: 0 });
	let bubble: HTMLElement | undefined = $state();
	let nextButton: HTMLButtonElement | undefined = $state();

	function visible(node: HTMLElement, rect: DOMRect): boolean {
		if (
			rect.width <= 0 ||
			rect.height <= 0 ||
			rect.bottom <= 0 ||
			rect.right <= 0 ||
			rect.top >= window.innerHeight ||
			rect.left >= window.innerWidth ||
			bubble?.contains(node)
		) {
			return false;
		}
		const x = Math.min(Math.max(rect.x + rect.width / 2, 1), window.innerWidth - 1);
		const y = Math.min(Math.max(rect.y + rect.height / 2, 1), window.innerHeight - 1);
		const hit = document.elementFromPoint(x, y);
		return (
			!hit ||
			bubble?.contains(hit) === true ||
			node.contains(hit) ||
			hit.contains(node) ||
			hit.closest('[aria-live]') !== null
		);
	}

	function measure(): void {
		viewport = { width: window.innerWidth, height: window.innerHeight };
		if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
			target = null;
			return;
		}
		const found = [...document.querySelectorAll<HTMLElement>(anchor)].find((node) =>
			visible(node, node.getBoundingClientRect())
		);
		if (!found) {
			target = null;
			return;
		}
		avoidBoxes = avoid
			? [...document.querySelectorAll<HTMLElement>(avoid)].map((node) => {
					const box = node.getBoundingClientRect();
					return { x: box.x, y: box.y, width: box.width, height: box.height };
				})
			: [];
		const rect = found.getBoundingClientRect();
		const next = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		if (
			!target ||
			Math.abs(target.x - next.x) > 0.5 ||
			Math.abs(target.y - next.y) > 0.5 ||
			Math.abs(target.width - next.width) > 0.5 ||
			Math.abs(target.height - next.height) > 0.5
		) {
			target = next;
		}
	}

	$effect(() => {
		void anchor;
		measure();
		const timer = setInterval(measure, 200);
		window.addEventListener('resize', measure);
		window.addEventListener('scroll', measure, true);
		return () => {
			clearInterval(timer);
			window.removeEventListener('resize', measure);
			window.removeEventListener('scroll', measure, true);
		};
	});

	const placement = $derived(
		target && bubbleWidth > 0
			? placeBubble(target, { width: bubbleWidth, height: bubbleHeight }, viewport, {
					prefer,
					avoid: avoidBoxes
				})
			: null
	);

	function onkeydown(event: KeyboardEvent): void {
		if (!target) return;
		if (event.key === 'Escape' && bubble?.contains(document.activeElement)) {
			event.preventDefault();
			onskip();
			return;
		}
		if (
			event.key === 'Tab' &&
			!event.shiftKey &&
			(document.activeElement === document.body || document.activeElement === null)
		) {
			event.preventDefault();
			nextButton?.focus();
		}
	}

	const arrowClass: Record<string, string> = {
		bottom: 'top-0 -translate-y-1/2',
		top: 'bottom-0 translate-y-1/2',
		right: 'left-0 -translate-x-1/2',
		left: 'right-0 translate-x-1/2'
	};
</script>

<svelte:window {onkeydown} />

{#if target}
	<div use:portal class="pointer-events-none fixed inset-0 z-60" data-testid="coach-mark">
		<span
			aria-hidden="true"
			class="coach-ring absolute rounded-xl border-2 border-accent"
			style:left="{target.x - 6}px"
			style:top="{target.y - 6}px"
			style:width="{target.width + 12}px"
			style:height="{target.height + 12}px"
		></span>
		<div
			bind:this={bubble}
			bind:clientWidth={bubbleWidth}
			bind:clientHeight={bubbleHeight}
			role="group"
			aria-label={title}
			class="pointer-events-auto absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-surface p-4 shadow-lift {placement
				? 'animate-pop-in'
				: 'invisible'}"
			style:left="{placement?.left ?? 0}px"
			style:top="{placement?.top ?? 0}px"
		>
			{#if placement?.aimed}
				<span
					aria-hidden="true"
					class="absolute size-3 rotate-45 border border-border bg-surface {arrowClass[
						placement.side
					]} {placement.side === 'bottom' || placement.side === 'right'
						? 'border-r-0 border-b-0'
						: 'border-t-0 border-l-0'}"
					style:left={placement.side === 'top' || placement.side === 'bottom'
						? `${placement.arrow}px`
						: undefined}
					style:top={placement.side === 'left' || placement.side === 'right'
						? `${placement.arrow}px`
						: undefined}
				></span>
			{/if}
			<div class="flex items-start gap-2">
				<div class="min-w-0 grow">
					{#if progress}
						<p class="text-xs font-bold tracking-wide text-accent uppercase">{progress}</p>
					{/if}
					<p class="mt-0.5 text-base font-bold">{title}</p>
				</div>
				<button
					type="button"
					aria-label={skipLabel}
					title={skipLabel}
					onclick={onskip}
					class="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition duration-(--duration-fast) ease-soft hover:bg-surface-2"
				>
					<X class="size-4" />
				</button>
			</div>
			<p class="mt-1 text-sm text-muted">{text}</p>
			<div class="mt-3 flex items-center justify-between gap-2">
				<button
					type="button"
					onclick={onskip}
					class="min-h-11 rounded-md px-3 text-sm font-semibold text-muted transition duration-(--duration-fast) ease-soft hover:bg-surface-2"
				>
					{skipLabel}
				</button>
				<button
					bind:this={nextButton}
					type="button"
					onclick={onnext}
					class="min-h-11 rounded-md bg-accent px-4 text-sm font-bold text-accent-contrast transition duration-(--duration-fast) ease-spring hover:bg-accent-strong active:scale-95"
					data-testid="coach-next"
				>
					{nextLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.coach-ring {
		animation: coach-pulse 1.8s ease-out infinite;
	}
	@keyframes coach-pulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 45%, transparent);
		}
		70%,
		100% {
			box-shadow: 0 0 0 12px transparent;
		}
	}
</style>
