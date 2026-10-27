<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudAlert from '@lucide/svelte/icons/cloud-alert';
	import CloudCheck from '@lucide/svelte/icons/cloud-check';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Download from '@lucide/svelte/icons/download';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Settings from '@lucide/svelte/icons/settings';
	import Share from '@lucide/svelte/icons/share';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IS_FREE } from '#lib/edition.ts';
	import OpenJobs from '#lib/features/camera/OpenJobs.svelte';
	import { requestPersistence } from '#lib/features/settings/storage.ts';
	import { common } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import {
		listProjects,
		loadProject,
		onLocalChange,
		onRemoteChange,
		saveProject,
		type ProjectSummary
	} from '#lib/state/persistence.ts';
	import { settings, updateSettings } from '#lib/state/settings.svelte.ts';
	import { reportStorageError } from '#lib/state/storageErrors.ts';
	import { syncState, type SyncStatus } from '#lib/state/sync.svelte.ts';
	import {
		listTrash,
		purgeExpiredTrash,
		purgeFromTrash,
		restoreFromTrash,
		TRASH_DAYS,
		trashProject,
		type TrashEntry
	} from '#lib/state/trash.ts';
	import BrandLogo from '#lib/ui/BrandLogo.svelte';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Fab from '#lib/ui/Fab.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Menu, { type MenuItem } from '#lib/ui/Menu.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import Chip from '#lib/ui/Chip.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { createProjectWithFloors } from './create.ts';
	import { defaultFloors, floorNamesFor, toggleFloorName } from './floors.ts';
	import { messages } from './i18n.ts';
	import { installState, promptInstall } from './install.svelte.ts';
	import { needsInstallGate, readEnvironment, shouldShowInstallHint } from './install.ts';
	import ProjectCard from './ProjectCard.svelte';
	import TrashSection from './TrashSection.svelte';

	let projects = $state<ProjectSummary[] | null>(null);
	let creating = $state(false);
	let newName = $state('');
	let floorMode = $state<'one' | 'many'>('one');
	let pickedFloors = $state<string[]>(defaultFloors(locale.language));
	let busy = $state(false);
	let renaming = $state<ProjectSummary | null>(null);
	let renameValue = $state('');
	let deleting = $state<ProjectSummary | null>(null);
	let confirmingDelete = $state(false);
	let menuOpen = $state(false);
	let menuX = $state(0);
	let menuY = $state(0);
	let menuTarget = $state<ProjectSummary | null>(null);
	let showInstallHint = $state(false);
	let trash = $state<TrashEntry[]>([]);
	let purging = $state<TrashEntry | null>(null);
	let confirmingPurge = $state(false);
	let gateOpen = $state(false);
	let loadFailed = $state(false);
	let installLater = $state(false);

	async function refresh(): Promise<void> {
		try {
			await purgeExpiredTrash();
			const [list, trashed] = await Promise.all([listProjects(), listTrash()]);
			projects = list;
			trash = trashed;
			loadFailed = false;
		} catch (error) {
			reportStorageError(error);
			projects = projects ?? [];
			loadFailed = true;
		}
	}

	$effect(() => {
		void syncState.lastSyncedAt;
		void refresh();
		const stopLocal = onLocalChange(() => void refresh());
		const stopRemote = onRemoteChange(() => void refresh());
		return () => {
			stopLocal();
			stopRemote();
		};
	});

	$effect(() => {
		showInstallHint = shouldShowInstallHint(readEnvironment(), settings.installHintSeen);
	});

	const syncIcons = {
		off: Cloud,
		synced: CloudCheck,
		pending: Cloud,
		offline: CloudOff,
		conflict: CloudAlert
	} as const;
	const syncLabels: Record<
		SyncStatus,
		'syncOff' | 'syncSynced' | 'syncPending' | 'syncOffline' | 'syncConflict'
	> = {
		off: 'syncOff',
		synced: 'syncSynced',
		pending: 'syncPending',
		offline: 'syncOffline',
		conflict: 'syncConflict'
	};
	const syncTones: Record<SyncStatus, string> = {
		off: 'text-muted/60',
		synced: 'text-accent',
		pending: 'text-muted',
		offline: 'text-warning',
		conflict: 'text-danger'
	};
	const SyncIcon = $derived(syncIcons[syncState.status]);

	const menuItems: MenuItem[] = $derived([
		{
			label: t(messages, 'renameAction'),
			icon: Pencil,
			onselect: () => {
				renaming = menuTarget;
				renameValue = menuTarget?.name ?? '';
			}
		},
		{
			label: t(messages, 'backupZip'),
			icon: Archive,
			onselect: () => {
				const target = menuTarget;
				if (target) void goto(`${resolve('/p/[id]/share', { id: target.id })}#backup`);
			}
		},
		{
			label: t(common, 'delete'),
			icon: Trash2,
			danger: true,
			separatorBefore: true,
			onselect: () => {
				deleting = menuTarget;
				confirmingDelete = true;
			}
		}
	]);

	function openMenu(project: ProjectSummary, point: { x: number; y: number }): void {
		menuTarget = project;
		menuX = point.x;
		menuY = point.y;
		menuOpen = true;
	}

	function startCreate(): void {
		const gate = needsInstallGate(readEnvironment(), {
			seen: settings.installHintSeen,
			projectCount: projects?.length ?? 0
		});
		if (gate) {
			gateOpen = true;
			return;
		}
		newName = '';
		floorMode = 'one';
		pickedFloors = defaultFloors(locale.language);
		creating = true;
	}

	function skipGate(): void {
		updateSettings({ installHintSeen: true });
		showInstallHint = false;
		gateOpen = false;
		newName = '';
		floorMode = 'one';
		pickedFloors = defaultFloors(locale.language);
		creating = true;
	}

	async function installApp(): Promise<void> {
		await promptInstall();
	}

	async function submitCreate(): Promise<void> {
		if (busy) return;
		busy = true;
		try {
			const first = (projects?.length ?? 0) === 0;
			const id = await createProjectWithFloors(
				newName.trim() || t(messages, 'defaultName'),
				floorMode === 'many' && pickedFloors.length >= 2 ? pickedFloors : undefined
			);
			creating = false;
			if (first) void requestPersistence();
			await goto(resolve('/p/[id]', { id }));
		} catch {
			toasts.show({
				message: t(messages, 'createFailed'),
				kind: 'error',
				actionLabel: t(messages, 'retry'),
				onaction: () => void submitCreate()
			});
		} finally {
			busy = false;
		}
	}

	async function submitRename(): Promise<void> {
		const target = renaming;
		const name = renameValue.trim();
		renaming = null;
		if (!target || !name || name === target.name) return;
		try {
			const project = await loadProject(target.id);
			if (!project) return;
			await saveProject({ ...project, name, updatedAt: new Date().toISOString() });
		} catch {
			toasts.show({
				message: t(messages, 'renameFailed'),
				kind: 'error',
				actionLabel: t(messages, 'retry'),
				onaction: () => {
					renaming = target;
					renameValue = name;
				}
			});
		}
	}

	async function confirmDelete(): Promise<void> {
		const target = deleting;
		deleting = null;
		if (!target) return;
		try {
			await trashProject(target.id);
			await refresh();
			toasts.show({
				message: t(messages, 'deleted', { name: target.name }),
				kind: 'success',
				actionLabel: t(messages, 'undo'),
				onaction: () => void undoDelete(target),
				duration: 10_000
			});
		} catch (error) {
			reportStorageError(error);
			toasts.show({
				message: t(messages, 'deleteFailed'),
				kind: 'error',
				actionLabel: t(messages, 'retry'),
				onaction: () => {
					deleting = target;
					confirmingDelete = true;
				}
			});
		}
	}

	async function undoDelete(target: { id: string; name: string }): Promise<void> {
		try {
			await restoreFromTrash(target.id);
			await refresh();
			toasts.show({
				message: t(messages, 'restoredFromTrash', { name: target.name }),
				kind: 'success'
			});
		} catch (error) {
			reportStorageError(error);
			toasts.show({ message: t(messages, 'restoreFailed'), kind: 'error' });
		}
	}

	async function confirmPurge(): Promise<void> {
		const target = purging;
		purging = null;
		if (!target) return;
		try {
			await purgeFromTrash(target.id);
			await refresh();
			toasts.show({ message: t(messages, 'purged', { name: target.name }), kind: 'success' });
		} catch (error) {
			reportStorageError(error);
			toasts.show({ message: t(messages, 'deleteFailed'), kind: 'error' });
		}
	}
</script>

<div class="h-full overflow-y-auto overscroll-contain">
	<div
		class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 pt-[max(1rem,var(--safe-top))] pr-[max(1.25rem,var(--safe-right))] pb-32 pl-[max(1.25rem,var(--safe-left))]"
	>
		<header class="flex items-center justify-between gap-3 py-2">
			<BrandLogo variant="wordmark" />
			<div class="flex items-center gap-1">
				{#if !IS_FREE}
					<span
						role="img"
						aria-label={t(messages, syncLabels[syncState.status])}
						title={t(messages, syncLabels[syncState.status])}
						class="inline-flex size-11 items-center justify-center {syncTones[syncState.status]}"
						data-testid="sync-status"
					>
						{#if syncState.status === 'pending'}
							<ProgressRing size={22} stroke={3} />
						{:else}
							<SyncIcon class="size-6" />
						{/if}
					</span>
				{/if}
				<IconButton
					href={resolve('/settings')}
					icon={Settings}
					label={t(common, 'settings')}
					data-testid="open-settings"
				/>
			</div>
		</header>

		<h1 class="mt-6 mb-5 text-4xl font-extrabold tracking-tight">{t(messages, 'title')}</h1>

		<OpenJobs />

		{#if showInstallHint}
			<aside
				class="mb-6 flex items-start gap-4 rounded-lg border border-accent/30 bg-accent-soft p-4"
			>
				<Share class="mt-0.5 size-6 shrink-0 text-accent" />
				<div class="min-w-0 grow">
					<p class="font-bold">{t(messages, 'installTitle')}</p>
					<p class="mt-0.5 text-sm text-muted">{t(messages, 'installText')}</p>
				</div>
				<Button
					size="sm"
					variant="secondary"
					onclick={() => {
						updateSettings({ installHintSeen: true });
						showInstallHint = false;
					}}
				>
					{t(messages, 'installDismiss')}
				</Button>
			</aside>
		{/if}

		{#if installState.canPrompt && !installState.standalone && !installLater}
			<aside
				class="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-accent/30 bg-accent-soft p-4"
				data-testid="install-prompt"
			>
				<Download class="size-6 shrink-0 text-accent" />
				<div class="min-w-48 grow basis-0">
					<p class="font-bold">{t(messages, 'installPromptTitle')}</p>
					<p class="mt-0.5 text-sm text-muted">{t(messages, 'installPromptText')}</p>
				</div>
				<div class="flex gap-2">
					<Button variant="ghost" size="sm" onclick={() => (installLater = true)}>
						{t(messages, 'installPromptLater')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						onclick={() => void installApp()}
						data-testid="install-app"
					>
						{t(messages, 'installPromptAction')}
					</Button>
				</div>
			</aside>
		{/if}

		{#if loadFailed && (projects === null || projects.length === 0)}
			<div
				class="flex grow flex-col items-center justify-center gap-4 p-6 text-center"
				data-testid="list-failed"
			>
				<div>
					<p class="text-xl font-bold">{t(messages, 'listFailed')}</p>
					<p class="mt-1.5 text-muted">{t(messages, 'listFailedText')}</p>
				</div>
				<Button variant="primary" onclick={() => void refresh()}>{t(messages, 'retry')}</Button>
			</div>
		{:else if projects === null}
			<div class="flex grow items-center justify-center text-accent">
				<ProgressRing size={40} />
			</div>
		{:else if projects.length === 0}
			<div class="flex grow flex-col items-center justify-center pt-4">
				<BrandLogo size="lg" />
				<EmptyState
					title={t(messages, 'emptyTitle')}
					description={t(messages, 'emptyText')}
					actionLabel={t(messages, 'newProject')}
					onaction={startCreate}
					data-testid="empty-create"
				/>
			</div>
		{:else}
			<div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
				{#each projects as project (project.id)}
					<ProjectCard {project} onmenu={openMenu} />
				{/each}
			</div>
		{/if}

		{#if trash.length > 0}
			<TrashSection
				entries={trash}
				onrestore={(entry) => void undoDelete(entry)}
				onpurge={(entry) => {
					purging = entry;
					confirmingPurge = true;
				}}
			/>
		{/if}
	</div>
</div>

{#if projects && projects.length > 0}
	<Fab label={t(messages, 'newProject')} extended onclick={startCreate} data-testid="new-project" />
{/if}

<Dialog
	bind:open={creating}
	title={t(messages, 'newProject')}
	closeLabel={t(common, 'close')}
	size="sm"
>
	<TextField
		label={t(messages, 'projectName')}
		placeholder={t(messages, 'namePlaceholder')}
		bind:value={newName}
		maxlength={80}
		autofocus
		onenter={() => void submitCreate()}
		data-testid="project-name"
	/>
	<div class="mt-4 grid gap-2">
		<SegmentedControl
			label={t(messages, 'floorsQuestion')}
			items={[
				{ value: 'one', label: t(messages, 'floorsOne') },
				{ value: 'many', label: t(messages, 'floorsMany') }
			]}
			bind:value={floorMode}
			full
		/>
		{#if floorMode === 'many'}
			<div class="flex flex-wrap gap-2" role="group" aria-label={t(messages, 'floorsPick')}>
				{#each floorNamesFor(locale.language) as name (name)}
					<Chip
						selected={pickedFloors.includes(name)}
						onclick={() => (pickedFloors = toggleFloorName(pickedFloors, name))}
						data-testid="new-floor-{name}"
					>
						{name}
					</Chip>
				{/each}
			</div>
		{/if}
	</div>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (creating = false)}>{t(common, 'cancel')}</Button>
		<Button
			variant="primary"
			loading={busy}
			disabled={floorMode === 'many' && pickedFloors.length < 2}
			onclick={() => void submitCreate()}
			data-testid="create-project"
		>
			{t(messages, 'createAction')}
		</Button>
	{/snippet}
</Dialog>

<Dialog
	open={renaming !== null}
	title={t(messages, 'renameTitle')}
	closeLabel={t(common, 'close')}
	size="sm"
	onclose={() => (renaming = null)}
>
	<TextField
		label={t(messages, 'projectName')}
		bind:value={renameValue}
		maxlength={80}
		autofocus
		onenter={() => void submitRename()}
	/>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (renaming = null)}>{t(common, 'cancel')}</Button>
		<Button variant="primary" onclick={() => void submitRename()}
			>{t(messages, 'saveAction')}</Button
		>
	{/snippet}
</Dialog>

<ConfirmDialog
	bind:open={confirmingDelete}
	title={t(messages, 'deleteTitle', { name: deleting?.name ?? '' })}
	message={t(messages, 'deleteMessage', { days: TRASH_DAYS })}
	confirmLabel={t(messages, 'toTrashAction')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	danger
	onconfirm={() => void confirmDelete()}
	oncancel={() => (deleting = null)}
/>

<ConfirmDialog
	bind:open={confirmingPurge}
	title={t(messages, 'purgeTitle', { name: purging?.name ?? '' })}
	message={t(messages, 'purgeMessage')}
	confirmLabel={t(messages, 'trashPurge')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	danger
	onconfirm={() => void confirmPurge()}
	oncancel={() => (purging = null)}
/>

<Dialog
	bind:open={gateOpen}
	title={t(messages, 'gateTitle')}
	closeLabel={t(common, 'close')}
	size="sm"
>
	<div class="flex flex-col gap-3" data-testid="install-gate">
		<div class="flex items-start gap-3">
			<Share class="mt-0.5 size-6 shrink-0 text-accent" />
			<p>{t(messages, 'gateText')}</p>
		</div>
		<p class="text-sm text-muted">{t(messages, 'gateSteps')}</p>
		<p class="text-sm text-muted">{t(messages, 'gateSkipHint')}</p>
	</div>
	{#snippet actions()}
		<Button variant="ghost" onclick={skipGate} data-testid="gate-skip">
			{t(messages, 'gateSkip')}
		</Button>
		<Button variant="primary" onclick={() => (gateOpen = false)} data-testid="gate-install">
			{t(messages, 'gateInstall')}
		</Button>
	{/snippet}
</Dialog>

<Menu bind:open={menuOpen} x={menuX} y={menuY} items={menuItems} label={t(messages, 'more')} />
