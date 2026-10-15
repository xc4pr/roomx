<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.ts';
	import { messages } from './i18n.ts';
	import { parseInline } from './logic.ts';

	let { text }: { text: string } = $props();

	const segments = $derived(parseInline(text));
</script>

{#each segments as segment, index (index)}
	{#if segment.kind === 'link'}
		<a
			href={segment.href}
			target={segment.external ? '_blank' : undefined}
			rel={segment.external ? 'noopener noreferrer' : undefined}
			class="font-semibold text-accent underline underline-offset-2 hover:text-accent-strong"
			>{segment.text}{#if segment.external}<span class="sr-only">
					{t(messages, 'external')}</span
				>{/if}</a
		>
	{:else if segment.kind === 'bold'}
		<strong class="font-semibold">{segment.text}</strong>
	{:else}
		{segment.text}
	{/if}
{/each}
