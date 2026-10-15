<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { backupAndAnnounce } from '#lib/features/settings/backupFlow.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { storageHealth, unsavedSnapshots } from '#lib/state/storageHealth.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';

	const titles = {
		quota: 'storageQuotaTitle',
		unavailable: 'storageUnavailableTitle',
		blocked: 'storageBlockedTitle',
		failed: 'storageFailedTitle'
	} as const;
	const texts = {
		quota: 'storageQuota',
		unavailable: 'storageUnavailable',
		blocked: 'storageBlocked',
		failed: 'storageFailed'
	} as const;

	let backing = $state(false);
	let retrying = $state(false);
	let takingOver = $state(false);
	let announced: string | null = null;

	const problem = $derived(storageHealth.problem);
	const readOnly = $derived(store.readOnly && store.project !== null);

	$effect(() => {
		if (problem) {
			announced = problem;
			return;
		}
		if (announced) {
			announced = null;
			toasts.show({ message: t(messages, 'storageRecovered'), kind: 'success' });
		}
	});

	async function backupNow(): Promise<void> {
		backing = true;
		const open = store.snapshot();
		await backupAndAnnounce(open ? [...unsavedSnapshots(), open] : unsavedSnapshots());
		backing = false;
	}

	async function retry(): Promise<void> {
		retrying = true;
		await store.flush();
		retrying = false;
	}

	async function takeOver(): Promise<void> {
		takingOver = true;
		await store.takeOver();
		takingOver = false;
	}
</script>

{#if problem}
	<div
		role="alert"
		class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-danger/30 bg-danger-soft px-4 py-3 pt-[max(0.75rem,var(--safe-top))] pr-[max(1rem,var(--safe-right))] pl-[max(1rem,var(--safe-left))] text-danger"
		data-testid="storage-alert"
	>
		<TriangleAlert class="size-6 shrink-0" />
		<div class="min-w-48 grow basis-0">
			<p class="font-bold">{t(messages, titles[problem])}</p>
			<p class="text-sm">{t(messages, texts[problem])}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if problem !== 'blocked'}
				<Button
					variant="danger"
					size="sm"
					loading={backing}
					onclick={() => void backupNow()}
					data-testid="storage-backup"
				>
					{t(messages, 'storageBackupNow')}
				</Button>
			{/if}
			{#if storageHealth.unsaved > 0}
				<Button
					variant="secondary"
					size="sm"
					loading={retrying}
					onclick={() => void retry()}
					data-testid="storage-retry"
				>
					{t(messages, 'storageRetry')}
				</Button>
			{/if}
		</div>
	</div>
{/if}

{#if readOnly}
	<div
		role="status"
		class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-warning/30 bg-warning-soft px-4 py-3 pr-[max(1rem,var(--safe-right))] pl-[max(1rem,var(--safe-left))] text-warning {problem
			? ''
			: 'pt-[max(0.75rem,var(--safe-top))]'}"
		data-testid="readonly-banner"
	>
		<Eye class="size-6 shrink-0" />
		<div class="min-w-48 grow basis-0">
			<p class="font-bold">{t(messages, 'readOnlyTitle')}</p>
			<p class="text-sm">{t(messages, 'readOnlyText')}</p>
		</div>
		<Button
			variant="primary"
			size="sm"
			loading={takingOver}
			onclick={() => void takeOver()}
			data-testid="take-over"
		>
			{t(messages, 'takeOver')}
		</Button>
	</div>
{/if}
