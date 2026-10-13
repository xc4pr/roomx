<script lang="ts">
	import Sofa from '@lucide/svelte/icons/sofa';
	import { pick } from '#lib/i18n/index.svelte.ts';
	import { session } from './session.svelte.ts';
	import { cachedThumbnail } from './thumbs.ts';

	const drag = $derived(session.drag);
	const url = $derived(drag ? cachedThumbnail(drag.entry) : undefined);
	const hidden = $derived(!drag || drag.over === 'board');
</script>

{#if drag}
	<div
		class="pointer-events-none fixed top-0 left-0 z-[80] transition-opacity duration-(--duration-fast) {hidden
			? 'opacity-0'
			: 'opacity-100'}"
		style="transform: translate3d({drag.px}px, {drag.py}px, 0) translate(-50%, -50%)"
		aria-hidden="true"
		data-testid="drag-chip"
	>
		<div
			class="flex animate-pop-in items-center gap-2 rounded-full border border-accent bg-surface/95 py-1 ps-1 pe-3 shadow-float"
		>
			<span
				class="flex size-11 items-center justify-center overflow-hidden rounded-full bg-surface-2"
			>
				{#if url}
					<img src={url} alt="" class="size-full object-contain p-0.5" draggable="false" />
				{:else}
					<Sofa class="size-5 text-muted" />
				{/if}
			</span>
			<span class="max-w-[14ch] truncate text-sm font-bold">{pick(drag.entry.name)}</span>
		</div>
	</div>
{/if}
