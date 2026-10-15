<script lang="ts">
	import { WALL_THICKNESS } from '#lib/core/defaults.ts';
	import type { MagnetContact } from './magnet.ts';

	interface Props {
		contacts: readonly MagnetContact[];
		k: number;
		pulse: number;
		fading?: boolean;
	}

	let { contacts, k, pulse, fading = false }: Props = $props();

	const u = $derived(1 / k);

	function strip(contact: MagnetContact): string {
		const { a, b, normal } = contact;
		const dx = normal.x * WALL_THICKNESS;
		const dy = normal.y * WALL_THICKNESS;
		return `${a.x},${a.y} ${b.x},${b.y} ${b.x + dx},${b.y + dy} ${a.x + dx},${a.y + dy}`;
	}

	function centre(contact: MagnetContact): { x: number; y: number } {
		return {
			x: (contact.a.x + contact.b.x) / 2 + (contact.normal.x * WALL_THICKNESS) / 2,
			y: (contact.a.y + contact.b.y) / 2 + (contact.normal.y * WALL_THICKNESS) / 2
		};
	}
</script>

<g pointer-events="none" class:fading data-testid="dock-marks">
	{#each contacts as contact (contact.key)}
		{#if contact.kind === 'wall'}
			{@const middle = centre(contact)}
			{#key pulse}
				<polygon
					points={strip(contact)}
					class="dock-strip fill-accent/35 stroke-accent"
					stroke-width="2"
					stroke-linejoin="round"
					vector-effect="non-scaling-stroke"
				/>
				<circle
					cx={middle.x}
					cy={middle.y}
					r={26 * u}
					class="dock-ripple fill-none stroke-accent"
					stroke-width="2.5"
					vector-effect="non-scaling-stroke"
				/>
			{/key}
		{:else}
			<line
				x1={contact.a.x}
				y1={contact.a.y}
				x2={contact.b.x}
				y2={contact.b.y}
				class="stroke-accent"
				stroke-width="2.5"
				stroke-dasharray="6 5"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
	{/each}
</g>

<style>
	.fading {
		animation: dock-fade 1.1s var(--ease-soft) both;
	}
	.dock-strip {
		transform-box: fill-box;
		transform-origin: center;
		animation: dock-click var(--duration-base) var(--ease-spring) both;
	}
	.dock-ripple {
		transform-box: fill-box;
		transform-origin: center;
		animation: dock-ripple 520ms var(--ease-soft) both;
	}
	@keyframes dock-click {
		from {
			opacity: 0.15;
			transform: scale(1.1);
		}
		55% {
			opacity: 1;
			transform: scale(0.985);
		}
	}
	@keyframes dock-ripple {
		from {
			opacity: 0.9;
			transform: scale(0.25);
		}
		to {
			opacity: 0;
			transform: scale(1);
		}
	}
	@keyframes dock-fade {
		0%,
		55% {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dock-strip,
		.dock-ripple {
			animation: none;
		}
		.dock-ripple {
			opacity: 0;
		}
	}
</style>
