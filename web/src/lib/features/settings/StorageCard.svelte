<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import Share from '@lucide/svelte/icons/share';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { installState, promptInstall } from '#lib/features/projects/install.svelte.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import { backupAndAnnounce } from './backupFlow.ts';
	import { messages } from './i18n.ts';
	import SettingsCard from './SettingsCard.svelte';
	import { formatBytes, quotaLevel, quotaShare, readStorage, type StorageInfo } from './storage.ts';

	let storage = $state<StorageInfo | null>(null);
	let asking = $state(false);
	let backingUp = $state(false);

	$effect(() => {
		void readStorage(true).then((info) => (storage = info));
	});

	async function askAgain(): Promise<void> {
		asking = true;
		storage = await readStorage(true);
		asking = false;
	}

	async function backup(): Promise<void> {
		backingUp = true;
		await backupAndAnnounce();
		backingUp = false;
	}

	const share = $derived(storage ? quotaShare(storage) : null);
	const level = $derived(storage ? quotaLevel(storage) : 'unknown');
	const percent = $derived(Math.round((share ?? 0) * 100));
	const barTone = $derived(
		level === 'full' ? 'bg-danger' : level === 'warn' ? 'bg-warning' : 'bg-accent'
	);
</script>

<SettingsCard title={t(messages, 'storage')} data-testid="storage-card">
	{#if storage === null}
		<div class="flex justify-center py-2 text-accent"><ProgressRing size={32} /></div>
	{:else}
		<div class="flex items-start gap-4">
			<div
				class="flex size-12 shrink-0 items-center justify-center rounded-full {storage.persist ===
				'persistent'
					? 'bg-accent-soft text-accent'
					: 'bg-warning-soft text-warning'}"
			>
				<HardDrive class="size-6" />
			</div>
			<div class="min-w-0">
				<p class="font-bold" data-testid="persist-state">
					{storage.persist === 'persistent'
						? t(messages, 'persistOn')
						: storage.persist === 'transient'
							? t(messages, 'persistOff')
							: t(messages, 'persistUnsupported')}
				</p>
				<p class="mt-0.5 text-sm text-muted">
					{storage.persist === 'persistent'
						? t(messages, 'persistOnText')
						: storage.persist === 'transient'
							? t(messages, 'persistOffText')
							: t(messages, 'persistUnsupportedText')}
				</p>
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<div class="h-2 overflow-hidden rounded-full bg-surface-2">
				<div
					class="h-full rounded-full {barTone} transition-[width] duration-(--duration-slow) ease-soft"
					style:width="{Math.max(1, (share ?? 0) * 100)}%"
				></div>
			</div>
			<p class="text-sm text-muted" data-testid="storage-usage">
				{storage.usage != null && storage.quota != null
					? t(messages, 'usage', {
							used: formatBytes(storage.usage, locale.language),
							quota: formatBytes(storage.quota, locale.language)
						})
					: t(messages, 'usageUnknown')}
			</p>
		</div>
		{#if level === 'warn' || level === 'full'}
			<div
				class="flex flex-col gap-3 rounded-md px-3 py-3 text-sm {level === 'full'
					? 'bg-danger-soft text-danger'
					: 'bg-warning-soft text-warning'}"
				role="status"
				data-testid="quota-warning"
			>
				<div class="flex items-start gap-3">
					<TriangleAlert class="mt-0.5 size-5 shrink-0" />
					<p>{t(messages, level === 'full' ? 'quotaFull' : 'quotaWarn', { percent })}</p>
				</div>
				<div>
					<Button size="sm" variant="secondary" loading={backingUp} onclick={() => void backup()}>
						{t(messages, 'reminderAction')}
					</Button>
				</div>
			</div>
		{/if}
		{#if storage.persist === 'transient'}
			<div>
				<Button variant="secondary" loading={asking} onclick={() => void askAgain()}>
					{t(messages, 'persistRequest')}
				</Button>
			</div>
		{/if}
	{/if}

	{#if installState.standalone}
		<p class="text-sm text-muted" data-testid="install-done">{t(messages, 'installDone')}</p>
	{:else if installState.canPrompt}
		<div class="flex flex-col gap-3 border-t border-border pt-5" data-testid="install-card">
			<div>
				<p class="font-bold">{t(messages, 'installTitle')}</p>
				<p class="mt-0.5 text-sm text-muted">{t(messages, 'installText')}</p>
			</div>
			<div>
				<Button
					variant="primary"
					icon={Download}
					onclick={() => void promptInstall()}
					data-testid="install-app"
				>
					{t(messages, 'installAction')}
				</Button>
			</div>
		</div>
	{:else if installState.iosSafari}
		<div class="flex items-start gap-3 border-t border-border pt-5" data-testid="ios-install">
			<Share class="mt-0.5 size-6 shrink-0 text-accent" />
			<div>
				<p class="font-bold">{t(messages, 'iosInstallTitle')}</p>
				<p class="mt-0.5 text-sm text-muted">{t(messages, 'iosInstallText')}</p>
			</div>
		</div>
	{/if}
</SettingsCard>
