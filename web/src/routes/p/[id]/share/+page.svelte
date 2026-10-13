<script lang="ts">
	import { onMount } from 'svelte';
	import ExportPanel from '#lib/features/export/ExportPanel.svelte';
	import ImportPanel from '#lib/features/import/ImportPanel.svelte';

	onMount(() => {
		const id = location.hash.slice(1);
		if (!id) return;
		const timer = setTimeout(
			() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
			120
		);
		return () => clearTimeout(timer);
	});
</script>

<ExportPanel />
<ImportPanel />
