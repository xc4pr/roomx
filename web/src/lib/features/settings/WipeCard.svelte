<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { resolve } from '$app/paths';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { backupAndAnnounce } from './backupFlow.ts';
	import { messages } from './i18n.ts';
	import SettingsCard from './SettingsCard.svelte';
	import { wipeAllLocalData } from './wipe.ts';

	let offering = $state(false);
	let confirming = $state(false);
	let backingUp = $state(false);
	let wiping = $state(false);

	async function backupFirst(): Promise<void> {
		backingUp = true;
		const saved = await backupAndAnnounce();
		backingUp = false;
		if (!saved) return;
		offering = false;
		confirming = true;
	}

	function skipBackup(): void {
		offering = false;
		confirming = true;
	}

	async function wipe(): Promise<void> {
		wiping = true;
		try {
			await wipeAllLocalData();
			location.replace(resolve('/'));
		} catch {
			wiping = false;
			toasts.show({ message: t(messages, 'wipeFailed'), kind: 'error' });
		}
	}
</script>

<SettingsCard title={t(messages, 'wipeTitle')} data-testid="wipe-card">
	<p class="text-base">{t(messages, 'wipeText')}</p>
	<div>
		<Button
			variant="danger"
			icon={Trash2}
			loading={wiping}
			onclick={() => (offering = true)}
			data-testid="wipe-start"
		>
			{t(messages, 'wipeAction')}
		</Button>
	</div>
</SettingsCard>

<Dialog
	bind:open={offering}
	title={t(messages, 'wipeBackupTitle')}
	description={t(messages, 'wipeBackupText')}
	closeLabel={t(common, 'close')}
	size="sm"
>
	{#snippet actions()}
		<Button variant="ghost" onclick={skipBackup} data-testid="wipe-skip-backup">
			{t(messages, 'wipeContinue')}
		</Button>
		<Button
			variant="primary"
			loading={backingUp}
			onclick={() => void backupFirst()}
			data-testid="wipe-backup"
		>
			{t(messages, 'wipeBackupFirst')}
		</Button>
	{/snippet}
</Dialog>

<ConfirmDialog
	bind:open={confirming}
	title={t(messages, 'wipeConfirmTitle')}
	message={t(messages, 'wipeConfirmText')}
	confirmLabel={t(messages, 'wipeConfirm')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	danger
	onconfirm={() => void wipe()}
/>
