<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Hammer from '@lucide/svelte/icons/hammer';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import MapIcon from '@lucide/svelte/icons/map';
	import Redo2 from '@lucide/svelte/icons/redo-2';
	import Share2 from '@lucide/svelte/icons/share-2';
	import Sofa from '@lucide/svelte/icons/sofa';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Box from '@lucide/svelte/icons/box';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ensureFullCatalog, fullCatalog } from '#lib/catalog/full.svelte.ts';
	import BuildCheck from '#lib/features/board/BuildCheck.svelte';
	import FloorsDialog from '#lib/features/projects/FloorsDialog.svelte';
	import { messages as projectMessages } from '#lib/features/projects/i18n.ts';
	import { openShortcuts } from '#lib/features/settings/shortcuts.svelte.ts';
	import { messages as settingsMessages } from '#lib/features/settings/i18n.ts';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { Project } from '#lib/core/schema.ts';
	import { mirrorHost } from '#lib/mirror/host.svelte.ts';
	import { putPreview } from '#lib/state/persistence.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { resetUi, ui } from '#lib/state/ui.svelte.ts';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import BottomNav from '#lib/ui/BottomNav.svelte';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { keyboardLikely } from '#lib/ui/device.ts';
	import { PHONE_PORTRAIT_QUERY } from '#lib/ui/layout.ts';
	import { media } from '#lib/ui/media.svelte.ts';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import type { LayoutProps } from './$types';

	let { children, params }: LayoutProps = $props();

	let status = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading');
	let checking = $state(false);
	let projectSettingsOpen = $state(false);
	const phone = media(PHONE_PORTRAIT_QUERY);
	const keyboard = keyboardLikely();

	// A derived string only changes when the id does; reading params directly re-runs on every navigation.
	const projectId = $derived(params.id);

	$effect(() => {
		const id = projectId;
		untrack(() => {
			status = 'loading';
			resetUi();
		});
		void load(id);
		return () => {
			const leaving = store.snapshot();
			void store.flush();
			if (leaving && leaving.id === id) void savePreview(leaving);
		};
	});

	$effect(() => {
		if (status !== 'ready' || store.readOnly) return;
		const id = projectId;
		return untrack(() => mirrorHost.start(id));
	});

	async function load(id: string): Promise<void> {
		status = 'loading';
		try {
			const [found] = await Promise.all([store.open(id), ensureFullCatalog()]);
			if (params.id === id) {
				status = found ? 'ready' : 'missing';
				if (found && fullCatalog.error) {
					toasts.show({ message: fullCatalog.error, id: 'catalog-notice', kind: 'info' });
				}
			}
		} catch {
			if (params.id === id) status = 'failed';
		}
	}

	async function savePreview(project: Project): Promise<void> {
		try {
			const { renderProjectPreview } = await import('#lib/three/offscreen.ts');
			await putPreview(project.id, await renderProjectPreview(project));
		} catch {
			return;
		}
	}

	const sections = $derived([
		{
			value: 'plan',
			href: resolve('/p/[id]', { id: params.id }),
			label: t(common, 'plan'),
			icon: MapIcon
		},
		{
			value: '3d',
			href: resolve('/p/[id]/3d', { id: params.id }),
			label: t(common, 'view3d'),
			icon: Box
		},
		{
			value: 'furnish',
			href: resolve('/p/[id]/furnish', { id: params.id }),
			label: t(common, 'furnish'),
			icon: Sofa
		},
		{
			value: 'share',
			href: resolve('/p/[id]/share', { id: params.id }),
			label: t(common, 'share'),
			icon: Share2
		}
	]);
	const navItems = $derived(
		sections.map((section) => ({
			...section,
			short: section.value === 'share' ? t(common, 'shareShort') : undefined
		}))
	);
	const current = $derived(sections.find((section) => section.href === page.url.pathname)?.value);

	function openBuilt(): void {
		const room = ui.focusRoomId ? `&room=${ui.focusRoomId}` : '';
		void goto(`${resolve('/p/[id]/3d', { id: params.id })}?build=1${room}`);
	}

	function onkeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
		if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
		const key = event.key.toLowerCase();
		if (key !== 'z' && key !== 'y') return;
		event.preventDefault();
		if (key === 'y' || event.shiftKey) store.redo();
		else store.undo();
	}
</script>

<svelte:window {onkeydown} />

{#if status === 'missing'}
	<div class="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
		<p class="text-xl font-bold">{t(common, 'notFound')}</p>
		<Button href={resolve('/')} variant="primary">{t(common, 'projects')}</Button>
	</div>
{:else if status === 'failed'}
	<div class="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
		<div>
			<p class="text-xl font-bold">{t(projectMessages, 'loadFailed')}</p>
			<p class="mt-1.5 text-muted">{t(projectMessages, 'loadFailedText')}</p>
		</div>
		<div class="flex flex-wrap justify-center gap-3">
			<Button variant="secondary" href={resolve('/')}>{t(common, 'projects')}</Button>
			<Button variant="primary" onclick={() => void load(params.id)}>
				{t(projectMessages, 'retry')}
			</Button>
		</div>
	</div>
{:else if status === 'ready' && store.project}
	<div class="flex h-full flex-col">
		<header
			data-app-header
			class="z-30 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 pt-[max(0.25rem,var(--safe-top))] pr-[max(0.5rem,var(--safe-right))] pb-1 pl-[max(0.5rem,var(--safe-left))] surface-glass md:flex-nowrap [@media(max-height:520px)]:pt-[max(0.125rem,var(--safe-top))] [@media(max-height:520px)]:pb-0.5"
		>
			<IconButton href={resolve('/')} icon={ChevronLeft} label={t(common, 'projects')} />
			<h1
				class="min-w-0 grow basis-0 truncate text-base font-bold tracking-tight sm:text-lg md:max-w-[22ch] md:grow-0 md:basis-auto"
			>
				{store.project.name}
			</h1>
			<IconButton
				icon={SlidersHorizontal}
				label={t(common, 'projectSettings')}
				onclick={() => (projectSettingsOpen = true)}
				data-testid="project-settings"
			/>
			{#if !phone.matches}
				<nav
					aria-label={t(common, 'mainNavigation')}
					class="order-last flex w-full justify-center md:order-none md:w-auto md:grow"
				>
					<SegmentedControl
						items={sections}
						value={current}
						label={store.project.name}
						collapse
						full
						class="w-full md:w-auto"
					/>
				</nav>
			{/if}
			<div class="flex items-center gap-0.5">
				<IconButton
					icon={Undo2}
					label={t(common, 'undo')}
					disabled={!store.canUndo}
					onclick={() => store.undo()}
					data-testid="undo"
				/>
				<IconButton
					icon={Redo2}
					label={t(common, 'redo')}
					disabled={!store.canRedo}
					onclick={() => store.redo()}
					data-testid="redo"
				/>
				{#if keyboard}
					<span class="hidden lg:contents">
						<IconButton
							icon={Keyboard}
							label={t(settingsMessages, 'shortcutsTitle')}
							onclick={openShortcuts}
							data-testid="open-shortcuts"
						/>
					</span>
				{/if}
			</div>
			<Button
				variant="primary"
				size="sm"
				icon={phone.matches ? undefined : Hammer}
				class="max-sm:px-3"
				data-testid="build"
				onclick={() => (checking = true)}
			>
				{t(common, 'create')}
			</Button>
		</header>
		<main
			class="relative min-h-0 grow overflow-y-auto"
			style:--safe-bottom={phone.matches ? '0px' : undefined}
		>
			{@render children()}
		</main>
		{#if phone.matches}
			<BottomNav items={navItems} value={current} label={t(common, 'mainNavigation')} />
		{/if}
	</div>
	<BuildCheck bind:open={checking} onproceed={openBuilt} />
	<FloorsDialog bind:open={projectSettingsOpen} />
{:else}
	<div class="flex h-full items-center justify-center text-accent">
		<ProgressRing size={44} stroke={4} />
	</div>
{/if}
