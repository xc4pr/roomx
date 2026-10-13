<script lang="ts">
	interface Props {
		value?: number;
		size?: number;
		stroke?: number;
		label?: string;
		class?: string;
	}

	let { value, size = 40, stroke = 4, label, class: extra = '' }: Props = $props();

	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const clamped = $derived(value === undefined ? 0.28 : Math.min(1, Math.max(0, value)));
</script>

<svg
	class="shrink-0 {value === undefined ? 'animate-spin' : ''} {extra}"
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	role={label ? 'progressbar' : 'presentation'}
	aria-label={label}
	aria-valuemin={label && value !== undefined ? 0 : undefined}
	aria-valuemax={label && value !== undefined ? 100 : undefined}
	aria-valuenow={label && value !== undefined ? Math.round(clamped * 100) : undefined}
>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={radius}
		fill="none"
		stroke="currentColor"
		stroke-opacity="0.2"
		stroke-width={stroke}
	/>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={radius}
		fill="none"
		stroke="currentColor"
		stroke-width={stroke}
		stroke-linecap="round"
		stroke-dasharray={circumference}
		stroke-dashoffset={circumference * (1 - clamped)}
		transform="rotate(-90 {size / 2} {size / 2})"
		class="transition-[stroke-dashoffset] duration-(--duration-slow) ease-soft"
	/>
</svg>
