<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import IconButton from '#lib/ui/IconButton.svelte';

	interface Props {
		value: number;
		label: string;
		min?: number;
		max?: number;
		decreaseLabel: string;
		increaseLabel: string;
		onchange: (value: number) => void;
	}

	let { value, label, min = 0, max = 99, decreaseLabel, increaseLabel, onchange }: Props = $props();
</script>

<div class="flex items-center justify-between gap-3">
	<span class="min-w-0 text-sm font-semibold">{label}</span>
	<div class="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5">
		<IconButton
			icon={Minus}
			label={decreaseLabel}
			variant="ghost"
			disabled={value <= min}
			onclick={() => onchange(Math.max(min, value - 1))}
		/>
		<span class="min-w-8 text-center text-base font-bold tabular-nums" aria-live="polite"
			>{value}</span
		>
		<IconButton
			icon={Plus}
			label={increaseLabel}
			variant="ghost"
			disabled={value >= max}
			onclick={() => onchange(Math.min(max, value + 1))}
		/>
	</div>
</div>
