<script lang="ts">
	import type { Room } from '#lib/core/schema.ts';
	import { connections } from './connections.svelte.ts';
	import { linkSpans } from './linkGeometry.ts';

	interface Props {
		rooms: readonly Room[];
		k: number;
		dimmed: boolean;
	}

	let { rooms, k, dimmed }: Props = $props();

	const u = $derived(1 / k);
	const spans = $derived(linkSpans(rooms, connections.links, connections.mirrored, 34 * u));

	function degrees(angle: number): number {
		let deg = (angle * 180) / Math.PI;
		if (deg > 90) deg -= 180;
		if (deg <= -90) deg += 180;
		return deg;
	}

	function visible(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
		return Math.hypot(b.x - a.x, b.y - a.y) * k > 64;
	}
</script>

<g
	pointer-events="none"
	opacity={dimmed ? 0.35 : 1}
	class="transition-opacity duration-(--duration-base)"
>
	{#each spans as span (span.key)}
		{#if span.symbol && visible(span.a, span.b)}
			<g
				transform="translate({span.symbol.x} {span.symbol.y}) rotate({degrees(
					span.angle
				)}) scale(1 -1)"
				data-link={span.key}
			>
				<circle r={11 * u} class="fill-surface stroke-border" stroke-width={1.2 * u} />
				<g
					transform="scale({(14 * u) / 24}) translate(-12 -12)"
					class="stroke-muted"
					fill="none"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M9 17H7A5 5 0 0 1 7 7h2" />
					<path d="M15 7h2a5 5 0 1 1 0 10h-2" />
					<path d="M8 12h8" />
				</g>
			</g>
		{/if}
	{/each}
</g>
