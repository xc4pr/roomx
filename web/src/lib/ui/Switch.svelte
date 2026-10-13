<script lang="ts">
	import { Switch } from 'bits-ui';

	interface Props {
		checked?: boolean;
		label: string;
		description?: string;
		disabled?: boolean;
		class?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		label,
		description,
		disabled = false,
		class: extra = '',
		onchange
	}: Props = $props();

	const uid = $props.id();
</script>

<div class="flex min-h-12 items-center justify-between gap-4 {extra}">
	<div class="min-w-0">
		<label for="sw-{uid}" class="block text-base font-medium">{label}</label>
		{#if description}
			<p class="text-sm text-muted">{description}</p>
		{/if}
	</div>
	<Switch.Root
		id="sw-{uid}"
		bind:checked
		{disabled}
		onCheckedChange={(next) => onchange?.(next)}
		class="relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full bg-border p-1 transition duration-(--duration-base) ease-soft before:absolute before:-inset-1.5 before:content-[''] disabled:opacity-40 data-[state=checked]:bg-accent"
	>
		<Switch.Thumb
			class="pointer-events-none block size-6 rounded-full bg-surface shadow-soft transition-transform duration-(--duration-base) ease-spring data-[state=checked]:translate-x-6 data-[state=checked]:bg-accent-contrast"
		/>
	</Switch.Root>
</div>
