<script lang="ts">
	interface Props {
		label: string;
		onmove: (move: { forward: number; strafe: number }) => void;
	}

	let { label, onmove }: Props = $props();

	const RADIUS = 48;
	const DEAD_ZONE = 0.12;

	let pad: HTMLDivElement | undefined = $state();
	let pointerId: number | null = null;
	let offset = $state({ x: 0, y: 0 });

	function update(event: PointerEvent): void {
		if (!pad) return;
		const rect = pad.getBoundingClientRect();
		let dx = event.clientX - (rect.left + rect.width / 2);
		let dy = event.clientY - (rect.top + rect.height / 2);
		const length = Math.hypot(dx, dy);
		if (length > RADIUS) {
			dx = (dx / length) * RADIUS;
			dy = (dy / length) * RADIUS;
		}
		offset = { x: dx, y: dy };
		const strafe = dx / RADIUS;
		const forward = -dy / RADIUS;
		const magnitude = Math.hypot(strafe, forward);
		if (magnitude < DEAD_ZONE) {
			onmove({ forward: 0, strafe: 0 });
			return;
		}
		const gain = (Math.min(1, magnitude) - DEAD_ZONE) / (1 - DEAD_ZONE) / magnitude;
		onmove({ forward: forward * gain, strafe: strafe * gain });
	}

	function down(event: PointerEvent): void {
		if (pointerId !== null) return;
		pointerId = event.pointerId;
		pad?.setPointerCapture(event.pointerId);
		update(event);
	}

	function move(event: PointerEvent): void {
		if (event.pointerId === pointerId) update(event);
	}

	function release(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		pointerId = null;
		offset = { x: 0, y: 0 };
		onmove({ forward: 0, strafe: 0 });
	}
</script>

<div
	bind:this={pad}
	role="application"
	aria-label={label}
	class="relative size-32 touch-none rounded-full border border-border shadow-soft surface-glass select-none"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={release}
	onpointercancel={release}
>
	<div
		class="absolute size-14 rounded-full bg-accent shadow-lift"
		style:left="calc(50% + {offset.x - 28}px)"
		style:top="calc(50% + {offset.y - 28}px)"
	></div>
</div>
