<script lang="ts">
	import { page } from '$app/state';
	import Viewer3D from '#lib/features/viewer/Viewer3D.svelte';

	const roomId = $derived(page.url.searchParams.get('room'));
	const animate = $derived(page.url.searchParams.has('build'));
</script>

<Viewer3D {roomId} {animate} />
