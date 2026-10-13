<script lang="ts">
	import type { Room } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { messages } from './i18n.ts';
	import { longestSegment, slopeShapes, zonePath } from './slopes.ts';

	let { room, k }: { room: Room; k: number } = $props();

	const uid = $props.id();
	const u = $derived(1 / k);
	const rot = $derived(room.boardPos.rot);
	const shapes = $derived(slopeShapes(room));
	const label = $derived(t(messages, 'standingMark'));

	function segmentPath(
		segments: readonly (readonly [{ x: number; y: number }, { x: number; y: number }])[]
	) {
		return segments.map(([a, b]) => `M${a.x} ${a.y} L${b.x} ${b.y}`).join(' ');
	}

	function labelAt(
		segments: Parameters<typeof longestSegment>[0],
		inward: { x: number; y: number }
	) {
		const best = longestSegment(segments);
		if (!best) return undefined;
		const length = Math.hypot(best[1].x - best[0].x, best[1].y - best[0].y);
		if (length * k < 60) return undefined;
		const gap = 9 * u;
		return {
			x: (best[0].x + best[1].x) / 2 + inward.x * gap,
			y: (best[0].y + best[1].y) / 2 + inward.y * gap
		};
	}
</script>

{#if shapes.length > 0}
	<g pointer-events="none" data-testid="slope-layer">
		<defs>
			<pattern
				id="slope-hatch-{uid}"
				patternUnits="userSpaceOnUse"
				width={7 * u}
				height={7 * u}
				patternTransform="rotate(45)"
			>
				<line
					x1="0"
					y1="0"
					x2="0"
					y2={7 * u}
					style="stroke: var(--color-muted); stroke-width: {u * 1.1}"
					opacity="0.55"
				/>
			</pattern>
		</defs>
		{#each shapes as shape (shape.slope.wall)}
			{@const d = { x: shape.edge[1].x - shape.edge[0].x, y: shape.edge[1].y - shape.edge[0].y }}
			{@const len = Math.hypot(d.x, d.y) || 1}
			{@const inward = { x: -d.y / len, y: d.x / len }}
			{@const at = labelAt(shape.standing, inward)}
			<path d={zonePath(shape.zone)} class="fill-muted" opacity="0.1" />
			<path d={zonePath(shape.zone)} fill="url(#slope-hatch-{uid})" />
			{#if shape.full.length > 0}
				<path
					d={segmentPath(shape.full)}
					class="fill-none stroke-muted"
					stroke-width="1.2"
					opacity="0.75"
					vector-effect="non-scaling-stroke"
				/>
			{/if}
			{#if shape.standing.length > 0}
				<path
					d={segmentPath(shape.standing)}
					class="fill-none stroke-text"
					stroke-width="1.5"
					stroke-dasharray="6 4"
					opacity="0.7"
					vector-effect="non-scaling-stroke"
				/>
			{/if}
			<path
				d={segmentPath([shape.edge])}
				transform="translate({inward.x * 6 * u} {inward.y * 6 * u})"
				class="fill-none stroke-muted"
				stroke-width="4"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
			{#if at}
				<g transform="translate({at.x} {at.y}) rotate({-rot}) scale(1 -1)">
					<text
						text-anchor="middle"
						dominant-baseline="central"
						font-size={11 * u}
						font-weight="700"
						class="fill-text stroke-surface tabular-nums [paint-order:stroke]"
						stroke-width={4 * u}
						stroke-linejoin="round"
					>
						{label}
					</text>
				</g>
			{/if}
		{/each}
	</g>
{/if}
