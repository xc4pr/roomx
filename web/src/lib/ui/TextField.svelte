<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		value?: string;
		label?: string;
		hint?: string;
		error?: string;
		placeholder?: string;
		type?: 'text' | 'url' | 'password' | 'search' | 'email';
		inputmode?: 'text' | 'url' | 'search' | 'email' | 'numeric' | 'decimal';
		autocomplete?: HTMLInputAttributes['autocomplete'];
		maxlength?: number;
		disabled?: boolean;
		readonly?: boolean;
		autofocus?: boolean;
		id?: string;
		class?: string;
		oninput?: (value: string) => void;
		onchange?: (value: string) => void;
		onenter?: (value: string) => void;
		trailing?: Snippet;
		'data-testid'?: string;
	}

	let {
		value = $bindable(''),
		label,
		hint,
		error,
		placeholder,
		type = 'text',
		inputmode,
		autocomplete = 'off',
		maxlength,
		disabled = false,
		readonly = false,
		autofocus = false,
		id,
		class: extra = '',
		oninput,
		onchange,
		onenter,
		trailing,
		'data-testid': testid
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `tf-${uid}`);
	let input: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (autofocus) input?.focus();
	});
</script>

<div class="flex flex-col gap-1.5 {extra}">
	{#if label}
		<label for={inputId} class="px-1 text-sm font-semibold text-muted">{label}</label>
	{/if}
	<div
		class="flex min-h-12 items-center gap-2 rounded-md border bg-surface px-4 transition duration-(--duration-fast) ease-soft focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft {error
			? 'border-danger'
			: 'border-border'} {disabled ? 'opacity-50' : ''}"
	>
		<input
			bind:this={input}
			id={inputId}
			{type}
			{inputmode}
			{autocomplete}
			{maxlength}
			{placeholder}
			{disabled}
			{readonly}
			bind:value
			aria-invalid={error ? true : undefined}
			aria-describedby={error || hint ? `${inputId}-desc` : undefined}
			class="min-w-0 grow bg-transparent py-2.5 text-base outline-none placeholder:text-muted/70"
			oninput={() => oninput?.(value)}
			onchange={() => onchange?.(value)}
			onkeydown={(event) => {
				if (event.key === 'Enter') onenter?.(value);
			}}
			data-testid={testid}
		/>
		{@render trailing?.()}
	</div>
	{#if error || hint}
		<p id="{inputId}-desc" class="px-1 text-sm {error ? 'text-danger' : 'text-muted'}">
			{error ?? hint}
		</p>
	{/if}
</div>
