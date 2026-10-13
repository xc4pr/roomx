<script lang="ts" module>
	export interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	interface Props {
		options: SelectOption[];
		value?: string;
		label?: string;
		hint?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
		onchange?: (value: string) => void;
	}

	let {
		options,
		value = $bindable(),
		label,
		hint,
		disabled = false,
		id,
		class: extra = '',
		onchange
	}: Props = $props();

	const uid = $props.id();
	const selectId = $derived(id ?? `sel-${uid}`);
</script>

<div class="flex flex-col gap-1.5 {extra}">
	{#if label}
		<label for={selectId} class="px-1 text-sm font-semibold text-muted">{label}</label>
	{/if}
	<div
		class="relative flex min-h-12 items-center rounded-md border border-border bg-surface transition duration-(--duration-fast) ease-soft focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft {disabled
			? 'opacity-50'
			: ''}"
	>
		<select
			id={selectId}
			{disabled}
			bind:value
			onchange={() => value !== undefined && onchange?.(value)}
			class="min-h-12 w-full appearance-none bg-transparent py-2 ps-4 pe-11 text-base outline-none"
		>
			{#each options as option (option.value)}
				<option value={option.value} disabled={option.disabled}>{option.label}</option>
			{/each}
		</select>
		<ChevronDown class="pointer-events-none absolute end-3 size-5 text-muted" />
	</div>
	{#if hint}
		<p class="px-1 text-sm text-muted">{hint}</p>
	{/if}
</div>
