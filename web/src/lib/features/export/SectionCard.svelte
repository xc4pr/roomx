<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		title: string;
		icon?: Component<{ class?: string }>;
		class?: string;
		id?: string;
		children: Snippet;
		'data-testid'?: string;
	}

	let {
		title,
		icon: Icon,
		class: extra = '',
		id,
		children,
		'data-testid': testid
	}: Props = $props();
</script>

<section
	{id}
	class="rounded-lg border border-border bg-surface p-5 shadow-soft {extra}"
	data-testid={testid}
>
	<h2 class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide text-muted uppercase">
		{#if Icon}<Icon class="size-4.5" />{/if}
		{title}
	</h2>
	<div class="flex flex-col gap-5">
		{@render children()}
	</div>
</section>
