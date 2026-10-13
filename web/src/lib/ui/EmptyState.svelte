<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { Component, Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		actionLabel?: string;
		icon?: Component<{ class?: string }>;
		class?: string;
		onaction?: () => void;
		children?: Snippet;
		'data-testid'?: string;
	}

	let {
		title,
		description,
		actionLabel,
		icon: Icon = Plus,
		class: extra = '',
		onaction,
		children,
		'data-testid': testid
	}: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-5 px-6 py-12 text-center {extra}">
	{#if onaction}
		<button
			type="button"
			aria-label={actionLabel ?? title}
			onclick={onaction}
			data-testid={testid}
			class="group flex size-32 items-center justify-center rounded-full border-2 border-dashed border-accent/50 bg-accent-soft text-accent transition duration-(--duration-base) ease-spring hover:scale-105 hover:border-accent active:scale-95"
		>
			<Icon
				class="size-14 transition-transform duration-(--duration-base) ease-spring group-hover:rotate-90"
			/>
		</button>
	{/if}
	<div class="max-w-sm">
		<h2 class="text-xl font-bold tracking-tight">{title}</h2>
		{#if description}
			<p class="mt-1.5 text-base text-muted">{description}</p>
		{/if}
	</div>
	{@render children?.()}
</div>
