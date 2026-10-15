<script lang="ts">
	import { asset } from '$app/paths';

	const BRAND = 'RoomX';

	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: 'full' | 'wordmark';
		size?: Size;
		class?: string;
	}

	let { variant = 'full', size = 'md', class: extra = '' }: Props = $props();

	const markSize: Record<Size, string> = {
		sm: 'h-14',
		md: 'h-24',
		lg: 'h-32'
	};
	const wordSize: Record<Size, string> = {
		sm: 'h-6',
		md: 'h-9',
		lg: 'h-11'
	};
	const wordOnly = $derived(variant === 'wordmark');
	const wordClass = $derived(wordOnly ? 'h-9' : wordSize[size]);
</script>

<div class="flex items-center justify-center {wordOnly ? '' : 'flex-col gap-3'} {extra}">
	{#if !wordOnly}
		<img
			src={asset('brand/mark.png')}
			alt=""
			width="512"
			height="373"
			class="{markSize[size]} w-auto"
		/>
	{/if}
	<img
		src={asset('brand/wordmark-light.png')}
		alt={BRAND}
		width="465"
		height="120"
		class="{wordClass} w-auto dark:hidden"
	/>
	<img
		src={asset('brand/wordmark-dark.png')}
		alt={BRAND}
		width="465"
		height="120"
		class="hidden {wordClass} w-auto dark:block"
	/>
</div>
