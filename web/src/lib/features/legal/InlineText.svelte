<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.ts';
	import { externalLink } from '#lib/security/url.ts';
	import { messages } from './i18n.ts';
	import { parseInline } from './logic.ts';

	let { text }: { text: string } = $props();

	const segments = $derived(parseInline(text));
	const linkClass =
		'font-semibold text-accent underline underline-offset-2 hover:text-accent-strong';
</script>

{#each segments as segment, index (index)}
	{#if segment.kind === 'link'}
		{@const link = segment.external ? externalLink(segment.href) : undefined}
		{#if link}
			<a {...link} class={linkClass}
				>{segment.text}<span class="sr-only"> {t(messages, 'external')}</span></a
			>
		{:else if !segment.external}
			<a href={segment.href} class={linkClass}>{segment.text}</a>
		{:else}
			{segment.text}
		{/if}
	{:else if segment.kind === 'bold'}
		<strong class="font-semibold">{segment.text}</strong>
	{:else}
		{segment.text}
	{/if}
{/each}
