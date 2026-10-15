<script lang="ts">
	import '@fontsource-variable/figtree';
	import './layout.css';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ensureFullCatalog } from '#lib/catalog/full.svelte.ts';
	import { consumePairFragment, pairErrorMessage } from '#lib/features/camera/pairing.ts';
	import AppAlerts from '#lib/features/projects/AppAlerts.svelte';
	import { watchInstall } from '#lib/features/projects/install.svelte.ts';
	import { remindOnLeave, startReminders } from '#lib/features/settings/reminders.ts';
	import ShortcutsDialog from '#lib/features/settings/ShortcutsDialog.svelte';
	import TourHost from '#lib/features/tour/TourHost.svelte';
	import { common } from '#lib/i18n/common.ts';
	import { purgeExpiredJobs } from '#lib/mirror/jobs.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { sharedBus } from '#lib/state/channel.ts';
	import { db } from '#lib/state/db.ts';
	import { runCleanup } from '#lib/state/cleanup.ts';
	import { probeStorage } from '#lib/state/persistence.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { storageHealth } from '#lib/state/storageHealth.svelte.ts';
	import { startSync, syncState } from '#lib/state/sync.svelte.ts';
	import { purgeExpiredTrash } from '#lib/state/trash.ts';
	import { appUpdate, applyUpdate, watchForUpdates } from '#lib/state/update.svelte.ts';
	import ToastHost from '#lib/ui/ToastHost.svelte';
	import { watchKeyboard } from '#lib/ui/keyboard.ts';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const alerting = $derived(
		storageHealth.problem !== null || (store.readOnly && store.project !== null)
	);

	async function pairFromLink(): Promise<void> {
		const outcome = await consumePairFragment();
		if (!outcome) return;
		if ('jobId' in outcome) {
			await goto(resolve('/m/[job]', { job: outcome.jobId }), { replace: true });
		} else {
			toasts.show({ message: pairErrorMessage(outcome.error), kind: 'error' });
		}
	}

	onMount(() => {
		void pairFromLink();
		const onHash = () => void pairFromLink();
		window.addEventListener('hashchange', onHash);
		watchForUpdates();
		if (page.url.pathname === resolve('/')) void ensureFullCatalog();
		const stopInstall = watchInstall();
		const stopKeyboard = watchKeyboard();
		const stopSync = startSync();
		const stopReminders = startReminders({ lastSyncedAt: () => syncState.lastSyncedAt });
		const stopWipe = sharedBus()?.subscribe((message) => {
			if (message.type !== 'wiped') return;
			store.abandon();
			db.close({ disableAutoOpen: true });
			setTimeout(() => location.reload(), 500);
		});
		void probeStorage().then((ok) => {
			if (!ok) return;
			void purgeExpiredTrash().then(() => runCleanup());
			void purgeExpiredJobs().catch(() => undefined);
		});
		return () => {
			window.removeEventListener('hashchange', onHash);
			stopInstall();
			stopKeyboard();
			stopSync();
			stopReminders();
			stopWipe?.();
		};
	});

	let wasInProject = false;

	$effect(() => {
		const inProject = page.params.id !== undefined;
		untrack(() => {
			if (wasInProject && !inProject) {
				void store.releaseLock();
				remindOnLeave();
			}
			wasInProject = inProject;
		});
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

<div class={alerting ? 'flex h-full flex-col' : 'contents'}>
	<AppAlerts />
	<div class={alerting ? 'min-h-0 grow' : 'contents'}>
		{@render children()}
	</div>
</div>
<ShortcutsDialog />
<TourHost />
<ToastHost closeLabel={t(common, 'close')} />
