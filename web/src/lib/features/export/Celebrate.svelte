<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	const COLORS = [
		'var(--color-accent)',
		'var(--color-window)',
		'var(--color-door)',
		'var(--color-electric)'
	];
	const dots = Array.from({ length: 10 }, (_, index) => {
		const angle = (index / 10) * Math.PI * 2 + 0.3;
		const reach = 26 + (index % 3) * 6;
		return {
			dx: Math.round(Math.cos(angle) * reach),
			dy: Math.round(Math.sin(angle) * reach),
			color: COLORS[index % COLORS.length]
		};
	});
</script>

<span class="relative inline-flex size-10 shrink-0 items-center justify-center" aria-hidden="true">
	<span
		class="celebrate-check inline-flex size-10 items-center justify-center rounded-full bg-accent text-accent-contrast"
	>
		<Check class="size-5" />
	</span>
	{#each dots as dot, index (index)}
		<span
			class="celebrate-dot absolute top-1/2 left-1/2 size-1.5 rounded-full"
			style:--dx="{dot.dx}px"
			style:--dy="{dot.dy}px"
			style:background-color={dot.color}
		></span>
	{/each}
</span>

<style>
	.celebrate-check {
		animation: celebrate-check var(--duration-slow) var(--ease-spring) both;
	}
	.celebrate-dot {
		opacity: 0;
		animation: celebrate-dot 640ms var(--ease-soft) 80ms both;
	}
	@keyframes celebrate-check {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
	}
	@keyframes celebrate-dot {
		0% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(0.6);
		}
		100% {
			opacity: 0;
			transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1);
		}
	}
</style>
