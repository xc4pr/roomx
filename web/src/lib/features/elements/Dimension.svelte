<script lang="ts">
	import type { Vec } from '#lib/core/geometry.ts';

	type Tone = 'normal' | 'snap' | 'warn';

	interface Props {
		a: Vec;
		b: Vec;
		text: string;
		pxPerMm: number;
		tone?: Tone;
	}

	let { a, b, text, pxPerMm, tone = 'normal' }: Props = $props();

	const px = (n: number): number => n / pxPerMm;
	const dx = $derived(b.x - a.x);
	const dy = $derived(b.y - a.y);
	const len = $derived(Math.hypot(dx, dy));
	const ux = $derived(len > 0 ? dx / len : 1);
	const uy = $derived(len > 0 ? dy / len : 0);
	const tick = $derived(px(5));
	const mid = $derived({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
	const showText = $derived(len * pxPerMm > 26);
	const boxWidth = $derived(px(text.length * 6.8 + 12));
	const boxHeight = $derived(px(19));
	const color = $derived(
		tone === 'warn'
			? 'var(--color-danger)'
			: tone === 'snap'
				? 'var(--color-accent)'
				: 'var(--color-muted)'
	);
</script>

<g class="dim" style="stroke: {color}; stroke-width: 1.25; fill: none; pointer-events: none">
	<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
	<line x1={a.x - uy * tick} y1={a.y + ux * tick} x2={a.x + uy * tick} y2={a.y - ux * tick} />
	<line x1={b.x - uy * tick} y1={b.y + ux * tick} x2={b.x + uy * tick} y2={b.y - ux * tick} />
	{#if showText}
		<g transform="translate({mid.x} {mid.y}) scale(1 -1)">
			<rect
				x={-boxWidth / 2}
				y={-boxHeight / 2}
				width={boxWidth}
				height={boxHeight}
				rx={px(9)}
				style="fill: var(--color-surface); stroke: {color}"
			/>
			<text
				text-anchor="middle"
				dominant-baseline="central"
				font-size={px(11.5)}
				style="fill: {tone === 'normal'
					? 'var(--color-text)'
					: color}; stroke: none; font-weight: 600"
			>
				{text}
			</text>
		</g>
	{/if}
</g>

<style>
	.dim :global(*) {
		vector-effect: non-scaling-stroke;
	}
</style>
