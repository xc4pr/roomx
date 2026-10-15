<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children: Snippet;
		class?: string;
		'data-testid'?: string;
	}

	let { title, children, class: extra = '', 'data-testid': testid }: Props = $props();
</script>

<section
	class="rounded-lg border border-border bg-surface p-5 shadow-soft {extra}"
	data-testid={testid}
>
	<h2 class="mb-4 text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
	<div class="flex flex-col gap-5">
		{@render children()}
	</div>
</section>
