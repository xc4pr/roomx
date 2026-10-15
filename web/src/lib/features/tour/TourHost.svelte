<script lang="ts">
	import { onMount } from 'svelte';
	import TourOverlay from './TourOverlay.svelte';
	import { autostartTour, tour } from './tour.svelte.ts';

	const START_DELAY = 500;

	onMount(() => {
		const timer = setTimeout(autostartTour, START_DELAY);
		return () => clearTimeout(timer);
	});
</script>

{#if tour.active}
	<TourOverlay />
{/if}
