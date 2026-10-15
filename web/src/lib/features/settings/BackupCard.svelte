<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import { formatDate } from '#lib/core/units.ts';
	import { restoreBackupSet, type ParsedBackupSet } from '#lib/features/export/backup.ts';
	import { common } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { photoLossNotes, readBackupFile, restoreErrorMessage } from './backupActions.ts';
	import { backupAndAnnounce } from './backupFlow.ts';
	import { messages } from './i18n.ts';
	import SettingsCard from './SettingsCard.svelte';

	let backingUp = $state(false);
	let restoring = $state(false);
	let progress = $state<{ done: number; total: number } | null>(null);
	let pending = $state.raw<ParsedBackupSet | null>(null);
	let confirming = $state(false);
	let fileInput = $state<HTMLInputElement>();

	const photoTotal = $derived(pending ? pending.photos.size : 0);

	async function backup(): Promise<void> {
		backingUp = true;
		await backupAndAnnounce();
		backingUp = false;
	}

	async function onFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const result = await readBackupFile(file);
		if (result.kind === 'error') {
			toasts.show({ message: restoreErrorMessage(result.code), kind: 'error', duration: 8000 });
			return;
		}
		pending = result.set;
		confirming = true;
	}

	async function restore(): Promise<void> {
		const set = pending;
		pending = null;
		if (!set) return;
		restoring = true;
		progress = { done: 0, total: set.projects.length };
		try {
			const result = await restoreBackupSet(set, {
				copySuffix: t(messages, 'copySuffix'),
				onProgress: (done, total) => (progress = { done, total })
			});
			const parts = [
				result.restored === 1
					? t(messages, 'restoreDoneOne')
					: t(messages, 'restoreDone', { n: result.restored })
			];
			if (result.copies > 0) parts.push(t(messages, 'restoreCopies', { n: result.copies }));
			parts.push(...photoLossNotes(result.missingPhotos, result.rejectedPhotos));
			toasts.show({
				message: parts.join(' '),
				kind: result.missingPhotos > 0 ? 'info' : 'success',
				duration: 8000
			});
		} catch {
			toasts.show({ message: t(messages, 'restoreStorage'), kind: 'error' });
		} finally {
			restoring = false;
			progress = null;
		}
	}
</script>

<SettingsCard title={t(messages, 'backupTitle')} data-testid="backup-card">
	<p class="text-base">{t(messages, 'backupText')}</p>
	{#if backingUp}
		<div class="flex items-center gap-3 text-accent" role="status">
			<ProgressRing size={28} stroke={3} />
			<span class="font-semibold text-text">{t(messages, 'backupWorking')}</span>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<Button
				variant="primary"
				icon={Archive}
				disabled={restoring}
				onclick={() => void backup()}
				data-testid="backup-all"
			>
				{t(messages, 'backupAll')}
			</Button>
			<p class="text-sm text-muted" data-testid="settings-last-backup">
				{settings.lastBackupAt
					? t(messages, 'lastBackup', { date: formatDate(settings.lastBackupAt, locale.language) })
					: t(messages, 'neverBackup')}
			</p>
		</div>
	{/if}
	<div class="flex flex-col gap-2 border-t border-border pt-5">
		<p class="text-sm text-muted">{t(messages, 'restoreHint')}</p>
		{#if restoring && progress}
			<div class="flex items-center gap-3 text-accent" role="status">
				<ProgressRing
					size={28}
					stroke={3}
					value={progress.total ? progress.done / progress.total : undefined}
				/>
				<span class="font-semibold text-text">
					{t(messages, 'restoreWorking', { done: progress.done, total: progress.total })}
				</span>
			</div>
		{:else}
			<div>
				<Button
					variant="secondary"
					icon={ArchiveRestore}
					disabled={backingUp}
					onclick={() => fileInput?.click()}
					data-testid="restore-all"
				>
					{t(messages, 'restoreAll')}
				</Button>
			</div>
		{/if}
		<input
			bind:this={fileInput}
			type="file"
			accept=".zip,application/zip"
			class="hidden"
			onchange={(event) => void onFile(event)}
			data-testid="restore-all-input"
		/>
	</div>
</SettingsCard>

<ConfirmDialog
	bind:open={confirming}
	title={t(messages, 'restoreTitle')}
	message={pending
		? `${
				pending.projects.length === 1
					? t(messages, 'restoreTextOne', { photos: photoTotal })
					: t(messages, 'restoreText', { n: pending.projects.length, photos: photoTotal })
			}${pending.skipped > 0 ? ' ' + t(messages, 'restoreSkipped', { n: pending.skipped }) : ''} ${t(messages, 'restoreNote')}`
		: ''}
	confirmLabel={t(messages, 'restoreStart')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	onconfirm={() => void restore()}
	oncancel={() => (pending = null)}
/>
