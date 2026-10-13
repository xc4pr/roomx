<script lang="ts">
	import '@fontsource-variable/figtree';
	import './layout.css';
	import { onMount, untrack } from 'svelte';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { pruneOrphanPhotos } from '#lib/state/persistence.ts';
	import { startSync } from '#lib/state/sync.svelte.ts';
	import { appUpdate, applyUpdate, watchForUpdates } from '#lib/state/update.svelte.ts';
	import ShortcutsDialog from '#lib/features/settings/ShortcutsDialog.svelte';
	import ToastHost from '#lib/ui/ToastHost.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		watchForUpdates();
		void pruneOrphanPhotos();
		return startSync();
	});

	$effect(() => {
		if (!appUpdate.ready) return;
		const message = t(common, 'updateReady');
		const actionLabel = t(common, 'reload');
		untrack(() =>
			toasts.show({ id: 'app-update', message, actionLabel, onaction: applyUpdate, sticky: true })
		);
	});
</script>

{@render children()}
<ShortcutsDialog />
<ToastHost closeLabel={t(common, 'close')} />
