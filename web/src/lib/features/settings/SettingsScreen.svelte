<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { IS_FREE } from '#lib/edition.ts';
	import type { Language, LengthUnit } from '#lib/core/units.ts';
	import { common } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings, updateSettings } from '#lib/state/settings.svelte.ts';
	import {
		syncDetail,
		syncNow,
		syncState,
		testServerConnection,
		type ConnectionResult,
		type SyncStatus
	} from '#lib/state/sync.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { keyboardLikely } from '#lib/ui/device.ts';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { isInterrupted, resumeStep } from '#lib/features/tour/logic.ts';
	import { TOUR_TOTAL } from '#lib/features/tour/steps.ts';
	import { startTour } from '#lib/features/tour/tour.svelte.ts';
	import BackupCard from './BackupCard.svelte';
	import { messages } from './i18n.ts';
	import { openShortcuts } from './shortcuts.svelte.ts';
	import DiagnosticsSection from './DiagnosticsSection.svelte';
	import StorageCard from './StorageCard.svelte';
	import WipeCard from './WipeCard.svelte';

	const keyboard = keyboardLikely();

	let deviceName = $state(settings.deviceName);
	let serverUrl = $state(settings.serverUrl);
	let token = $state(settings.token);
	let testing = $state(false);
	let testResult = $state<ConnectionResult | null>(null);

	const statusKeys = {
		off: 'syncStatusOff',
		synced: 'syncStatusSynced',
		pending: 'syncStatusPending',
		offline: 'syncStatusOffline',
		conflict: 'syncStatusConflict'
	} as const satisfies Record<SyncStatus, string>;

	const testKeys = {
		invalidUrl: 'testInvalidUrl',
		unreachable: 'testUnreachable',
		notServer: 'testNotServer',
		noToken: 'testNoToken',
		unauthorized: 'testUnauthorized',
		failed: 'testFailed'
	} as const;

	const lastSync = $derived(
		syncState.lastSyncedAt
			? new Date(syncState.lastSyncedAt).toLocaleString(locale.language, {
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			: t(messages, 'syncNever')
	);

	async function runTest(): Promise<void> {
		testing = true;
		testResult = null;
		testResult = await testServerConnection(serverUrl, token);
		testing = false;
	}
</script>

{#snippet section(title: string, body: Snippet)}
	<section class="rounded-lg border border-border bg-surface p-5 shadow-soft">
		<h2 class="mb-4 text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
		<div class="flex flex-col gap-5">
			{@render body()}
		</div>
	</section>
{/snippet}

<div class="h-full overflow-y-auto overscroll-contain">
	<div
		class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 pt-[max(1rem,var(--safe-top))] pr-[max(1.25rem,var(--safe-right))] pb-[max(3rem,var(--safe-bottom))] pl-[max(1.25rem,var(--safe-left))]"
	>
		<header class="flex items-center gap-2 py-2">
			<IconButton
				href={resolve('/')}
				icon={ChevronLeft}
				label={t(messages, 'backToProjects')}
				data-testid="settings-back"
			/>
			<h1 class="text-3xl font-extrabold tracking-tight">{t(common, 'settings')}</h1>
		</header>

		{#snippet appearance()}
			<div class="flex flex-col gap-2">
				<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'language')}</span>
				<SegmentedControl
					label={t(messages, 'language')}
					value={settings.language}
					size="lg"
					full
					items={[
						{ value: 'de', label: t(messages, 'german') },
						{ value: 'en', label: t(messages, 'english') }
					]}
					onchange={(value) => updateSettings({ language: value as Language })}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'unit')}</span>
				<SegmentedControl
					label={t(messages, 'unit')}
					value={settings.unit}
					size="lg"
					full
					items={[
						{ value: 'cm', label: `${t(messages, 'unitCm')} (cm)` },
						{ value: 'm', label: `${t(messages, 'unitM')} (m)` }
					]}
					onchange={(value) => updateSettings({ unit: value as LengthUnit })}
				/>
			</div>
		{/snippet}
		{@render section(t(messages, 'appearance'), appearance)}

		{#snippet device()}
			<TextField
				label={t(messages, 'deviceName')}
				hint={t(messages, 'deviceHint')}
				placeholder={t(messages, 'devicePlaceholder')}
				maxlength={60}
				data-testid="device-name"
				bind:value={deviceName}
				onchange={(value) => updateSettings({ deviceName: value.trim() })}
			/>
		{/snippet}
		{#snippet localData()}
			<p class="text-base" data-testid="local-data">{t(messages, 'localDataText')}</p>
			<div>
				<Button
					variant="secondary"
					icon={ShieldCheck}
					href={resolve('/rechtliches')}
					data-testid="open-legal"
				>
					{t(messages, 'legalLink')}
				</Button>
			</div>
		{/snippet}
		{#if IS_FREE}
			{@render section(t(messages, 'localData'), localData)}
		{:else}
			{@render section(t(messages, 'device'), device)}
		{/if}

		{#snippet server()}
			<TextField
				label={t(messages, 'serverUrl')}
				hint={t(messages, 'serverHint')}
				type="url"
				inputmode="url"
				placeholder="https://"
				data-testid="server-url"
				bind:value={serverUrl}
				onchange={(value) => {
					testResult = null;
					updateSettings({ serverUrl: value.trim() });
				}}
			/>
			{#if !serverUrl.trim() && syncDetail.originFound}
				<p class="-mt-3 px-1 text-sm text-accent" data-testid="server-origin">
					{t(messages, 'serverOrigin')}
				</p>
			{/if}
			<TextField
				label={t(messages, 'token')}
				type="password"
				autocomplete="off"
				data-testid="server-token"
				bind:value={token}
				onchange={(value) => {
					testResult = null;
					updateSettings({ token: value.trim() });
				}}
			/>
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt class="text-muted">{t(messages, 'syncStatus')}</dt>
				<dd class="font-semibold" data-testid="sync-status">
					{t(messages, statusKeys[syncState.status])}
				</dd>
				<dt class="text-muted">{t(messages, 'syncLastSync')}</dt>
				<dd data-testid="sync-last">{lastSync}</dd>
			</dl>
			{#if syncDetail.unauthorized}
				<p
					class="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
					data-testid="sync-unauthorized"
				>
					{t(messages, 'syncUnauthorized')}
				</p>
			{/if}
			{#if testResult}
				<p
					class="rounded-md px-3 py-2 text-sm {testResult.kind === 'ok'
						? 'bg-accent-soft text-accent'
						: 'bg-danger-soft text-danger'}"
					role="status"
					data-testid="server-test-result"
				>
					{testResult.kind === 'ok'
						? t(messages, testResult.projects === 1 ? 'testOkOne' : 'testOk', {
								version: testResult.version,
								n: testResult.projects
							})
						: t(messages, testKeys[testResult.kind])}
				</p>
			{/if}
			<div class="flex flex-wrap gap-3">
				<Button
					variant="secondary"
					loading={testing}
					onclick={() => void runTest()}
					data-testid="sync-test"
				>
					{t(messages, 'syncTest')}
				</Button>
				<Button
					loading={syncDetail.running}
					disabled={syncState.status === 'off'}
					data-testid="sync-now"
					onclick={() => void syncNow()}
				>
					{t(messages, 'syncNow')}
				</Button>
			</div>
		{/snippet}
		{#if !IS_FREE}
			{@render section(t(messages, 'server'), server)}
		{/if}

		<BackupCard />
		<StorageCard />

		{#snippet helpBody()}
			<div class="flex flex-col gap-2">
				<Button
					variant="secondary"
					icon={Sparkles}
					full
					onclick={() => startTour()}
					data-testid="replay-intro"
				>
					{t(messages, 'replayIntro')}
				</Button>
				{#if isInterrupted(settings.tourStep) && settings.tourStep > 0}
					<Button
						variant="ghost"
						full
						onclick={() => startTour({ resume: true })}
						data-testid="resume-tour"
					>
						{t(messages, 'resumeTour', {
							n: resumeStep(settings.tourStep) + 1,
							total: TOUR_TOTAL
						})}
					</Button>
				{/if}
				<p class="px-1 text-sm text-muted">{t(messages, 'replayIntroHint')}</p>
			</div>
			{#if keyboard}
				<div class="flex flex-col gap-2">
					<Button
						variant="secondary"
						icon={Keyboard}
						full
						onclick={openShortcuts}
						data-testid="show-shortcuts"
					>
						{t(messages, 'showShortcuts')}
					</Button>
					<p class="px-1 text-sm text-muted">{t(messages, 'showShortcutsHint')}</p>
				</div>
			{/if}
		{/snippet}
		{@render section(t(messages, 'help'), helpBody)}

		{#snippet aboutBody()}
			<div class="flex flex-col gap-2">
				<Button
					variant="secondary"
					icon={ShieldCheck}
					full
					href={resolve('/rechtliches')}
					data-testid="open-legal"
				>
					{t(messages, 'legalLink')}
				</Button>
				<p class="px-1 text-sm text-muted">{t(messages, 'legalHint')}</p>
			</div>
		{/snippet}
		{#if !IS_FREE}
			{@render section(t(messages, 'about'), aboutBody)}
		{/if}

		<DiagnosticsSection />
		<WipeCard />
	</div>
</div>
