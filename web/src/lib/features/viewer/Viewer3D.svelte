<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import BrickWall from '@lucide/svelte/icons/brick-wall';
	import Camera from '@lucide/svelte/icons/camera';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Focus from '@lucide/svelte/icons/focus';
	import Footprints from '@lucide/svelte/icons/footprints';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import PackageOpen from '@lucide/svelte/icons/package-open';
	import PanelTop from '@lucide/svelte/icons/panel-top';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Share2 from '@lucide/svelte/icons/share-2';
	import Slice from '@lucide/svelte/icons/slice';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import Zap from '@lucide/svelte/icons/zap';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import { createViewer } from '#lib/three/viewer.ts';
	import type { ContextPhase } from '#lib/three/viewer/context.ts';
	import type { QualityTier } from '#lib/three/viewer/quality.ts';
	import type {
		CameraMode,
		SceneContent,
		SceneViewer,
		ViewInsets,
		WallMode
	} from '#lib/three/types.ts';
	import Button from '#lib/ui/Button.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import Select from '#lib/ui/Select.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { PHONE_PORTRAIT_QUERY } from '#lib/ui/layout.ts';
	import { media } from '#lib/ui/media.svelte.ts';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { diffScene, signatureOf, type SceneSignature } from './diff.ts';
	import { messages } from './i18n.ts';
	import Joystick from './Joystick.svelte';
	import { saveImage } from './share.ts';

	interface Props {
		roomId?: string | null;
		animate?: boolean;
		toolbar?: boolean;
		insets?: ViewInsets;
		onready?: (viewer: SceneViewer) => void;
		onroomchange?: (roomIds: string[]) => void;
		onwalkchange?: (walking: boolean) => void;
	}

	let {
		roomId = null,
		animate = false,
		toolbar = true,
		insets = {},
		onready,
		onroomchange,
		onwalkchange
	}: Props = $props();

	const REBUILD_INTERVAL = 140;
	const ITEM_INTERVAL = 16;
	const HINT_MS = 7000;

	let canvas: HTMLCanvasElement | undefined = $state();
	let viewer = $state.raw<SceneViewer | null>(null);
	let failed = $state(false);
	let contextPhase = $state<ContextPhase>('ok');
	let quality = $state<QualityTier>(0);
	let attempt = $state(0);
	let wallMode = $state<WallMode>('cutaway');
	let ceiling = $state(false);
	let lights = $state(false);
	let cameraMode = $state<CameraMode>('orbit');
	let picked = $state<string | null>(null);
	let toolbarHeight = $state(0);
	let hintVisible = $state(false);
	let coarse = $state(true);
	let toolsOpen = $state(false);
	const compact = media(PHONE_PORTRAIT_QUERY);

	const rooms = $derived(store.project?.rooms ?? []);
	const selection = $derived(
		picked ?? (roomId && rooms.some((room) => room.id === roomId) ? roomId : 'all')
	);
	const roomIds = $derived(
		selection !== 'all' && rooms.some((room) => room.id === selection)
			? [selection]
			: rooms.map((room) => room.id)
	);
	const roomOptions = $derived([
		...(rooms.length > 1 ? [{ value: 'all', label: t(messages, 'wholeApartment') }] : []),
		...rooms.map((room, index) => ({
			value: room.id,
			label: room.name || t(messages, 'unnamedRoom', { n: index + 1 })
		}))
	]);
	const wallItems = $derived([
		{ value: 'up', label: t(messages, 'wallsUp'), icon: BrickWall },
		{ value: 'cutaway', label: t(messages, 'wallsCutaway'), icon: Slice },
		{ value: 'down', label: t(messages, 'wallsDown'), icon: SquareDashed }
	]);
	const projectId = $derived(store.project?.id);
	const showNext = $derived(
		toolbar && !!projectId && page.url.pathname === resolve('/p/[id]/3d', { id: projectId })
	);
	const canShare = $derived(typeof navigator !== 'undefined' && 'canShare' in navigator);
	const walking = $derived(cameraMode === 'walk');
	const trayClass = $derived(
		walking || !compact.matches
			? 'contents'
			: toolsOpen
				? 'flex basis-full flex-wrap items-start gap-2'
				: 'hidden'
	);
	const viewInsets = $derived<ViewInsets>({
		top: (toolbar && !walking ? toolbarHeight : 0) + (insets.top ?? 0),
		right: insets.right ?? 0,
		bottom: insets.bottom ?? 0,
		left: insets.left ?? 0
	});

	$effect(() => {
		void roomId;
		picked = null;
	});

	$effect(() => {
		const query = matchMedia('(pointer: coarse)');
		coarse = query.matches;
		const listener = (event: MediaQueryListEvent) => (coarse = event.matches);
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});

	$effect(() => {
		const ids = roomIds;
		untrack(() => {
			if (cameraMode === 'walk') setCameraMode('orbit');
			onroomchange?.(ids);
		});
	});

	$effect(() => {
		const active = walking;
		untrack(() => onwalkchange?.(active));
		return () => untrack(() => onwalkchange?.(false));
	});

	$effect(() => {
		const element = canvas;
		if (!element) return;
		let created: SceneViewer | null = null;
		try {
			created = untrack(() =>
				createViewer(
					element,
					{
						wallMode,
						ceiling,
						electrical: ui.electricalLayer,
						lightsOn: lights
					},
					{
						onContext: (phase) => (contextPhase = phase),
						onQuality: (tier) => (quality = tier)
					}
				)
			);
		} catch {
			failed = true;
			return;
		}
		failed = false;
		contextPhase = 'ok';
		quality = 0;
		viewer = created;
		untrack(() => onready?.(created));
		return () => {
			created.dispose();
			viewer = null;
			cameraMode = 'orbit';
		};
	});

	$effect(() => {
		viewer?.setViewInsets(walking ? {} : viewInsets);
	});

	$effect(() => {
		if (!viewer) return;
		const current: SceneViewer = viewer;
		let applied: SceneSignature | null = null;
		let lastApply = 0;
		let lastRebuild = 0;
		let first = true;
		let timer: ReturnType<typeof setTimeout> | undefined;

		function flush(): void {
			timer = undefined;
			const ids = untrack(() => roomIds);
			const snapshot = store.snapshot();
			if (!snapshot || ids.length === 0) return;
			const content: SceneContent = { project: snapshot, roomIds: ids };
			const next = signatureOf(content);
			const change = diffScene(applied, next);
			const now = performance.now();
			if (change.kind === 'none') {
				applied = next;
				return;
			}
			if (change.kind === 'rebuild') {
				const wait = lastRebuild + REBUILD_INTERVAL - now;
				if (!first && wait > 0) {
					timer = setTimeout(flush, wait);
					return;
				}
				current.setContent(content, {
					animate: first && untrack(() => animate),
					pop: first ? [] : change.added
				});
				first = false;
				lastRebuild = performance.now();
			} else {
				for (const id of change.removed) current.removeItem(id, { animate: true });
				for (const item of change.added) current.addItem(item, { pop: true });
				for (const move of change.moves) current.moveItem(move.id, move.transform);
			}
			applied = next;
			lastApply = performance.now();
		}

		function request(): void {
			if (timer !== undefined) return;
			if (first) {
				flush();
				return;
			}
			timer = setTimeout(flush, Math.max(0, lastApply + ITEM_INTERVAL - performance.now()));
		}

		const stop = $effect.root(() => {
			$effect(() => {
				const project = store.project;
				void project?.updatedAt;
				void project?.activeVariantId;
				void roomIds;
				untrack(request);
			});
		});
		return () => {
			stop();
			clearTimeout(timer);
		};
	});

	$effect(() => {
		viewer?.setOptions({
			wallMode,
			ceiling,
			electrical: ui.electricalLayer,
			lightsOn: lights
		});
	});

	$effect(() => {
		viewer?.setSelectedItem(ui.selectedItemId);
	});

	$effect(() => {
		if (!walking) return;
		hintVisible = true;
		const timer = setTimeout(() => (hintVisible = false), HINT_MS);
		const onkeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setCameraMode('orbit');
		};
		window.addEventListener('keydown', onkeydown, true);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('keydown', onkeydown, true);
		};
	});

	function reload3d(): void {
		failed = false;
		contextPhase = 'ok';
		attempt += 1;
	}

	function setCameraMode(mode: CameraMode): void {
		cameraMode = mode;
		viewer?.setCameraMode(mode);
	}

	async function capture(): Promise<void> {
		if (!viewer) return;
		try {
			const blob = await viewer.screenshot();
			await saveImage(blob, store.project?.name ?? 'roomx');
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			toasts.show({ message: t(messages, 'screenshotFailed'), kind: 'error' });
		}
	}
</script>

<div
	class="relative size-full overflow-hidden bg-bg"
	data-testid="viewer3d"
	data-quality={quality}
	data-context={contextPhase}
>
	{#if failed}
		<EmptyState
			class="h-full"
			icon={Box}
			title={t(messages, 'webglTitle')}
			description={t(messages, 'webglText')}
		>
			<Button icon={RefreshCw} onclick={reload3d} data-testid="viewer-retry">
				{t(messages, 'reload')}
			</Button>
		</EmptyState>
	{:else if store.project && rooms.length === 0}
		<EmptyState
			class="h-full"
			icon={Box}
			title={t(messages, 'emptyTitle')}
			description={t(messages, 'emptyText')}
		/>
	{:else}
		{#key attempt}
			<canvas
				bind:this={canvas}
				data-testid="canvas3d"
				aria-label={t(messages, 'canvasLabel')}
				class="absolute inset-0 size-full touch-none outline-none select-none"
			></canvas>
		{/key}

		{#if contextPhase !== 'ok'}
			<div
				class="absolute inset-0 z-20 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm"
				role={contextPhase === 'failed' ? 'alert' : 'status'}
				data-testid="viewer-context-{contextPhase}"
			>
				<div class="flex max-w-sm animate-fade-in flex-col items-center gap-4 text-center">
					{#if contextPhase === 'lost'}
						<div class="text-accent"><ProgressRing size={40} /></div>
						<div>
							<h2 class="text-xl font-bold tracking-tight">{t(messages, 'contextLostTitle')}</h2>
							<p class="mt-1.5 text-base text-muted">{t(messages, 'contextLostText')}</p>
						</div>
					{:else}
						<div>
							<h2 class="text-xl font-bold tracking-tight">{t(messages, 'contextFailedTitle')}</h2>
							<p class="mt-1.5 text-base text-muted">{t(messages, 'contextFailedText')}</p>
						</div>
						<Button icon={RefreshCw} onclick={reload3d} data-testid="viewer-retry">
							{t(messages, 'reload')}
						</Button>
					{/if}
				</div>
			</div>
		{/if}

		{#if toolbar && viewer}
			<div
				bind:clientHeight={toolbarHeight}
				style:padding-right="max(0.75rem, var(--safe-right), {insets.right ?? 0}px)"
				class="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3 pl-[max(0.75rem,var(--safe-left))]"
			>
				{#if walking}
					<div class="pointer-events-auto">
						<Button
							variant="primary"
							icon={LogOut}
							onclick={() => setCameraMode('orbit')}
							data-testid="walk-exit"
						>
							{t(messages, 'endWalk')}
						</Button>
					</div>
				{:else}
					{#if rooms.length > 1}
						<div
							class="pointer-events-auto min-w-0 rounded-lg shadow-soft surface-glass max-sm:flex-1"
						>
							<Select
								options={roomOptions}
								value={selection}
								label={t(messages, 'room')}
								class="min-w-44 max-sm:min-w-0 [&>label]:sr-only"
								onchange={(value) => (picked = value)}
							/>
						</div>
					{/if}
					{#if compact.matches}
						<div class="pointer-events-auto ms-auto rounded-full p-1 shadow-soft surface-glass">
							<IconButton
								icon={Ellipsis}
								label={toolsOpen ? t(messages, 'hideTools') : t(messages, 'showTools')}
								pressed={toolsOpen}
								onclick={() => (toolsOpen = !toolsOpen)}
								data-testid="viewer-tools-toggle"
							/>
						</div>
					{/if}
				{/if}
				<div class={trayClass}>
					{#if !walking}
						<div class="pointer-events-auto rounded-full shadow-soft surface-glass">
							<SegmentedControl
								items={wallItems}
								bind:value={wallMode as string}
								label={t(messages, 'wallMode')}
								collapse
								class="bg-transparent"
							/>
						</div>
					{/if}
					<div
						class="pointer-events-auto ms-auto flex items-center gap-1 rounded-full p-1 shadow-soft surface-glass"
						data-testid="viewer-tools"
					>
						{#if !walking}
							<IconButton
								icon={PanelTop}
								label={t(messages, 'ceiling')}
								pressed={ceiling}
								onclick={() => (ceiling = !ceiling)}
							/>
							<IconButton
								icon={Zap}
								label={t(messages, 'electrical')}
								pressed={ui.electricalLayer}
								onclick={() => (ui.electricalLayer = !ui.electricalLayer)}
							/>
						{/if}
						<IconButton
							icon={Lightbulb}
							label={t(messages, 'lights')}
							pressed={lights}
							onclick={() => (lights = !lights)}
						/>
						{#if !walking}
							<IconButton
								icon={Footprints}
								label={t(messages, 'walk')}
								onclick={() => setCameraMode('walk')}
								data-testid="walk-enter"
							/>
							<IconButton
								icon={Focus}
								label={t(messages, 'resetCamera')}
								onclick={() => viewer?.resetCamera()}
							/>
						{/if}
						<IconButton
							icon={canShare ? Share2 : Camera}
							label={canShare ? t(messages, 'screenshotShare') : t(messages, 'screenshot')}
							onclick={capture}
						/>
					</div>
				</div>
			</div>
		{/if}

		{#if showNext && projectId && viewer && !walking}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-3 pr-[max(0.75rem,var(--safe-right))] pb-[max(0.75rem,var(--safe-bottom))]"
			>
				<div class="pointer-events-auto rounded-full shadow-soft surface-glass">
					<Button
						variant="ghost"
						icon={PackageOpen}
						href={resolve('/p/[id]/share', { id: projectId })}
						class="rounded-full! text-accent"
						data-testid="to-package"
					>
						{t(messages, 'nextPackage')}
					</Button>
				</div>
			</div>
		{/if}

		{#if walking}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 pr-[max(1rem,var(--safe-right))] pb-[max(1rem,var(--safe-bottom))] pl-[max(1rem,var(--safe-left))]"
			>
				{#if coarse}
					<div class="pointer-events-auto">
						<Joystick
							label={t(messages, 'joystick')}
							onmove={(move) => viewer?.setWalkInput(move)}
						/>
					</div>
				{/if}
				{#if hintVisible}
					<p
						class="pointer-events-none mx-auto mb-2 animate-fade-in rounded-full px-4 py-2 text-center text-sm text-muted shadow-soft surface-glass"
					>
						{coarse ? t(messages, 'walkHint') : t(messages, 'walkHintDesktop')}
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
