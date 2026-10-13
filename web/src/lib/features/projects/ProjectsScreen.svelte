<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudAlert from '@lucide/svelte/icons/cloud-alert';
	import CloudCheck from '@lucide/svelte/icons/cloud-check';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Settings from '@lucide/svelte/icons/settings';
	import Share from '@lucide/svelte/icons/share';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { requestPersistence } from '#lib/features/settings/storage.ts';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import {
		deleteProject,
		listProjects,
		loadProject,
		onLocalChange,
		saveProject,
		type ProjectSummary
	} from '#lib/state/persistence.ts';
	import { createProject } from '#lib/state/project.svelte.ts';
	import { settings, updateSettings } from '#lib/state/settings.svelte.ts';
	import { syncState, type SyncStatus } from '#lib/state/sync.svelte.ts';
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
	import CoachHost from './CoachHost.svelte';
	import { advanceCoach } from './coach.svelte.ts';
	import { messages } from './i18n.ts';
	import { readEnvironment, shouldShowInstallHint } from './install.ts';
	import ProjectCard from './ProjectCard.svelte';

	let projects = $state<ProjectSummary[] | null>(null);
	let creating = $state(false);
	let newName = $state('');
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

	async function refresh(): Promise<void> {
		projects = await listProjects();
	}

	$effect(() => {
		void syncState.lastSyncedAt;
		void refresh();
		return onLocalChange(() => void refresh());
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
		newName = '';
		creating = true;
	}

	async function submitCreate(): Promise<void> {
		if (busy) return;
		busy = true;
		try {
			const first = (projects?.length ?? 0) === 0;
			const id = await createProject(newName.trim() || t(messages, 'defaultName'));
			creating = false;
			if (first) void requestPersistence();
			advanceCoach(0);
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
			await deleteProject(target.id);
			await refresh();
			toasts.show({ message: t(messages, 'deleted', { name: target.name }), kind: 'success' });
		} catch {
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
</script>

<div class="h-full overflow-y-auto overscroll-contain">
	<div
		class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 pt-[max(1rem,var(--safe-top))] pr-[max(1.25rem,var(--safe-right))] pb-32 pl-[max(1.25rem,var(--safe-left))]"
	>
		<header class="flex items-center justify-between gap-3 py-2">
			<span class="text-3xl font-extrabold tracking-tight" aria-label={t(common, 'appName')}>
				room<span class="text-accent">x</span>
			</span>
			<div class="flex items-center gap-1">
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
				<IconButton
					href={resolve('/settings')}
					icon={Settings}
					label={t(common, 'settings')}
					data-testid="open-settings"
				/>
			</div>
		</header>

		<h1 class="mt-6 mb-5 text-4xl font-extrabold tracking-tight">{t(messages, 'title')}</h1>

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

		{#if projects === null}
			<div class="flex grow items-center justify-center text-accent">
				<ProgressRing size={40} />
			</div>
		{:else if projects.length === 0}
			<EmptyState
				class="grow"
				title={t(messages, 'emptyTitle')}
				description={t(messages, 'emptyText')}
				actionLabel={t(messages, 'newProject')}
				onaction={startCreate}
				data-testid="empty-create"
			/>
		{:else}
			<div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
				{#each projects as project (project.id)}
					<ProjectCard {project} onmenu={openMenu} />
				{/each}
			</div>
		{/if}
	</div>
</div>

<CoachHost page="projects" hasProjects={(projects?.length ?? 0) > 0} />

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
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (creating = false)}>{t(common, 'cancel')}</Button>
		<Button
			variant="primary"
			loading={busy}
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
	message={t(messages, 'deleteMessage')}
	confirmLabel={t(common, 'delete')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	danger
	onconfirm={() => void confirmDelete()}
	oncancel={() => (deleting = null)}
/>

<Menu bind:open={menuOpen} x={menuX} y={menuY} items={menuItems} label={t(messages, 'more')} />
