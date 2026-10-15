<script lang="ts">
	import { page } from '$app/state';
	import CameraMode from '#lib/features/camera/CameraMode.svelte';

	const jobId = $derived(page.params.job ?? '');
</script>

<CameraMode {jobId} />
