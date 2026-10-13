<script lang="ts">
	import { boundingBox, pointInPolygon, type Vec } from '#lib/core/geometry.ts';
	import { ROOM_TEMPLATES } from '#lib/core/templates.ts';
	import {
		dimensionsOf,
		templatePolygon,
		type TemplateId,
		type TemplateParams
	} from './templateInfo.ts';

	interface Props {
		id: TemplateId;
		params: TemplateParams;
		invalid?: string[];
		active?: string;
		plain?: boolean;
		label?: string;
		class?: string;
	}

	let {
		id,
		params,
		invalid = [],
		active,
		plain = false,
		label,
		class: extra = ''
	}: Props = $props();

	const W = 300;
	const H = 200;
	const PAD = 38;

	const valid = $derived(templatePolygon(id, params));
	const fallback = $derived(ROOM_TEMPLATES[id].defaults);
	const shapeParams = $derived(valid ? params : fallback);
	const shape = $derived(valid ?? ROOM_TEMPLATES[id].build(fallback));
	const box = $derived(boundingBox(shape));
	const scale = $derived(
		Math.min((W - 2 * PAD) / (box.maxX - box.minX), (H - 2 * PAD) / (box.maxY - box.minY))
	);
	const offsetX = $derived((W - (box.maxX - box.minX) * scale) / 2);
	const offsetY = $derived((H - (box.maxY - box.minY) * scale) / 2);

	function project(p: Vec): Vec {
		return { x: offsetX + (p.x - box.minX) * scale, y: H - offsetY - (p.y - box.minY) * scale };
	}

	const points = $derived(shape.map((p) => project(p)));
	const path = $derived(
		points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ' Z'
	);

	const dims = $derived(
		dimensionsOf(id, shapeParams).map((dim) => {
			const a = project(dim.from);
			const b = project(dim.to);
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			let normal = { x: -dy / len, y: dx / len };
			const probe = { x: mid.x + normal.x * 4, y: mid.y + normal.y * 4 };
			if (pointInPolygon(probe, points)) normal = { x: -normal.x, y: -normal.y };
			const away = 13;
			const shift = (p: Vec) => ({ x: p.x + normal.x * away, y: p.y + normal.y * away });
			return { key: dim.key, a: shift(a), b: shift(b), mid: shift(mid) };
		})
	);
</script>

<svg
	viewBox="0 0 {W} {H}"
	role="img"
	aria-label={label}
	class="mx-auto block h-auto max-h-52 w-full max-w-sm select-none {extra}"
>
	<path
		d={path}
		class="stroke-accent {valid ? 'fill-accent-soft' : 'fill-surface-2'}"
		stroke-width="2.5"
		stroke-linejoin="round"
		opacity={valid ? 1 : 0.6}
	/>
	{#each plain ? [] : dims as dim (dim.key)}
		{@const bad = invalid.includes(dim.key)}
		{@const on = active === dim.key}
		<line
			x1={dim.a.x}
			y1={dim.a.y}
			x2={dim.b.x}
			y2={dim.b.y}
			class={bad ? 'stroke-danger' : on ? 'stroke-accent' : 'stroke-muted'}
			stroke-width="1.5"
			stroke-linecap="round"
		/>
		<circle
			cx={dim.mid.x}
			cy={dim.mid.y}
			r="10"
			class="{bad ? 'stroke-danger' : on ? 'stroke-accent' : 'stroke-border'} {on
				? 'fill-accent'
				: 'fill-surface'}"
			stroke-width="1.5"
		/>
		<text
			x={dim.mid.x}
			y={dim.mid.y}
			text-anchor="middle"
			dominant-baseline="central"
			class="text-[12px] font-bold {on
				? 'fill-accent-contrast'
				: bad
					? 'fill-danger'
					: 'fill-text'}"
		>
			{dim.key}
		</text>
	{/each}
</svg>
