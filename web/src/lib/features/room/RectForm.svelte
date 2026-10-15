<script lang="ts">
	import { rectanglePolygon } from '#lib/core/defaults.ts';
	import { boundingBox } from '#lib/core/geometry.ts';
	import type { Point, Room } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import NumberField from '#lib/ui/NumberField.svelte';
	import { messages } from './i18n.ts';

	interface Props {
		room: Room;
		onapply: (polygon: Point[]) => void;
		onseal: () => void;
	}

	let { room, onapply, onseal }: Props = $props();

	const box = $derived(boundingBox(room.polygon));
	const length = $derived(Math.round(box.maxX - box.minX));
	const width = $derived(Math.round(box.maxY - box.minY));
</script>

<div class="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="rect-form">
	<NumberField
		label={t(messages, 'length')}
		hint={t(messages, 'lengthHint')}
		value={length}
		min={300}
		max={80000}
		decreaseLabel={t(messages, 'less')}
		increaseLabel={t(messages, 'more')}
		oninput={(mm) => onapply(rectanglePolygon(mm, width))}
		onchange={onseal}
		data-testid="room-length"
	/>
	<NumberField
		label={t(messages, 'width')}
		hint={t(messages, 'widthHint')}
		value={width}
		min={300}
		max={80000}
		decreaseLabel={t(messages, 'less')}
		increaseLabel={t(messages, 'more')}
		oninput={(mm) => onapply(rectanglePolygon(length, mm))}
		onchange={onseal}
		data-testid="room-width"
	/>
</div>
