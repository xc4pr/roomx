<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Map from '@lucide/svelte/icons/map';
	import Plus from '@lucide/svelte/icons/plus';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import Sofa from '@lucide/svelte/icons/sofa';
	import type { CatalogEntry } from '#lib/core/catalog.ts';
	import Board from '#lib/features/board/Board.svelte';
	import Viewer3D from '#lib/features/viewer/Viewer3D.svelte';
	import { rotate, type Vec } from '#lib/core/geometry.ts';
	import type { Item } from '#lib/core/schema.ts';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import type { SceneViewer, ViewInsets } from '#lib/three/types.ts';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Fab from '#lib/ui/Fab.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { WIDE_QUERY } from '#lib/ui/layout.ts';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { panelLayout } from '#lib/ui/panelWidth.svelte.ts';
	import { SHEET_FRACTIONS } from '#lib/ui/sheet.ts';
	import SidePanel from '#lib/ui/SidePanel.svelte';
	import Tabs from '#lib/ui/Tabs.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import {
		addCatalogEntry,
		currentRoom,
		deleteItem,
		duplicateItem,
		nudgeItem,
		rotateItem
	} from './actions.ts';
	import { arrowVector, type ArrowKey } from './arrows.ts';
	import BriefEditor from './BriefEditor.svelte';
	import BudgetPill from './BudgetPill.svelte';
	import CatalogPanel from './CatalogPanel.svelte';
	import CustomItemDialog from './CustomItemDialog.svelte';
	import DragChip from './DragChip.svelte';
	import { messages } from './i18n.ts';
	import { attach3d } from './interaction3d.ts';
	import ItemEditor from './ItemEditor.svelte';
	import { itemMount } from './place.ts';
	import SelectionBar from './SelectionBar.svelte';
	import { openPanel, session, type PanelTabId } from './session.svelte.ts';
	import ShoppingList from './ShoppingList.svelte';
	import VariantBar from './VariantBar.svelte';

	let viewer = $state.raw<SceneViewer | null>(null);
	let host3d: HTMLElement | undefined = $state();
	let wide = $state(false);
	let walking = $state(false);
	let panelBody: HTMLElement | undefined = $state();
	let areaHeight = $state(0);
	let areaWidth = $state(0);

	const rooms = $derived(store.project?.rooms ?? []);
	const itemCount = $derived(store.activeVariant?.items.length ?? 0);
	const selectedItem = $derived(ui.selectedItemId ? store.item(ui.selectedItemId) : undefined);

	const viewItems = $derived([
		{ value: '2d', label: t(messages, 'view2d'), icon: Map },
		{ value: '3d', label: t(messages, 'view3d'), icon: Box }
	]);
	const tabs = $derived([
		{ value: 'catalog', label: t(messages, 'tabCatalog') },
		{ value: 'item', label: t(messages, 'tabItem') },
		{ value: 'list', label: t(messages, 'tabList'), badge: itemCount || undefined },
		{ value: 'brief', label: t(messages, 'tabBrief') }
	]);
	const title = $derived(
		{
			catalog: t(messages, 'titleCatalog'),
			item: t(messages, 'titleItem'),
			list: t(messages, 'titleList'),
			brief: t(messages, 'titleBrief')
		}[session.tab]
	);

	$effect(() => {
		const query = matchMedia(WIDE_QUERY);
		wide = query.matches;
		if (!wide && session.snap === 'half') session.snap = 'peek';
		const listener = (event: MediaQueryListEvent) => (wide = event.matches);
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});

	let lastRoomId: string | null = null;

	$effect(() => {
		const list = rooms;
		if (list.length === 0) return;
		const current = ui.selectedRoomId;
		if (current && list.some((room) => room.id === current)) {
			lastRoomId = current;
			return;
		}
		const back = list.find((room) => room.id === (ui.focusRoomId ?? lastRoomId));
		selectRoom((back ?? list[0]).id);
	});

	const BAR_RESERVE = 68;
	const BAR_MIN_WIDTH = 620;
	const BAR_FAB_SPACE = 380;
	const FAB_RESERVE = 88;
	const insets = $derived<ViewInsets>(
		wide
			? { bottom: BAR_RESERVE, right: session.panelOpen ? panelLayout.settledWidth + 12 : 0 }
			: {
					bottom:
						BAR_RESERVE +
						(session.panelOpen ? SHEET_FRACTIONS[session.snap] * areaHeight : FAB_RESERVE)
				}
	);
	const barStyle = $derived(
		wide
			? `bottom:1rem;${session.panelOpen ? `padding-right:${panelLayout.width + 24}px` : ''}`
			: session.panelOpen
				? `bottom:calc(${SHEET_FRACTIONS[session.snap] * 100}% + 0.75rem)`
				: 'bottom:calc(max(1.25rem, var(--safe-bottom)) + 4rem + 0.75rem)'
	);
	const barCompact = $derived(
		!wide ||
			areaWidth - (session.panelOpen ? panelLayout.width + 24 : BAR_FAB_SPACE) < BAR_MIN_WIDTH
	);
	const showBar = $derived(!walking && (wide || !session.panelOpen || session.snap !== 'full'));

	$effect(() => {
		if (session.view !== '3d' || !viewer || !host3d) return;
		return attach3d(host3d, viewer, { isWalking: () => walking });
	});

	$effect(() => {
		void session.tab;
		const scroller = panelBody?.closest('.overflow-y-auto');
		if (scroller) scroller.scrollTop = 0;
	});

	function roomsChanged(ids: string[]): void {
		if (ids.length === 1 && ui.selectedRoomId !== ids[0]) selectRoom(ids[0]);
	}

	$effect(() => {
		if (ui.selectedItemId && !store.item(ui.selectedItemId)) ui.selectedItemId = null;
	});

	$effect(() => {
		if (session.view === '2d') {
			viewer = null;
			walking = false;
		}
	});

	$effect(() => () => {
		session.drag = null;
		session.drop = null;
		session.guides = null;
	});

	function add(entry: CatalogEntry): void {
		const room = currentRoom();
		if (!room) {
			toasts.show({ message: t(messages, 'noRoom'), kind: 'error' });
			return;
		}
		addCatalogEntry(entry, room);
	}

	function drop(entry: CatalogEntry, x: number, y: number, over: 'board' | 'viewer' | null): void {
		if (over === 'board') {
			session.drop = { entry, clientX: x, clientY: y };
			setTimeout(() => {
				if (!session.drop) return;
				session.drop = null;
				toasts.show({ message: t(messages, 'dropIntoRoom'), kind: 'info' });
			}, 80);
		} else if (over === 'viewer') {
			const hit = viewer?.pickFloor(x, y);
			const room = hit ? store.room(hit.roomId) : undefined;
			if (!hit || !room) {
				toasts.show({ message: t(messages, 'dropIntoRoom'), kind: 'info' });
				return;
			}
			addCatalogEntry(entry, room, { raw: { x: hit.x, y: hit.y }, threshold: 90 });
		}
	}

	const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"], dialog';
	const ARROW_WIDGETS =
		'[role="radio"], [role="tab"], [role="slider"], [role="option"], [role="menuitem"], [role="spinbutton"], [role="listbox"]';

	function isTyping(target: EventTarget | null): boolean {
		return target instanceof Element && target.closest(TEXT_ENTRY) !== null;
	}

	function ownsArrows(target: EventTarget | null): boolean {
		return target instanceof Element && target.closest(ARROW_WIDGETS) !== null;
	}

	const ARROWS: Record<string, ArrowKey> = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowLeft: 'left',
		ArrowRight: 'right'
	};

	function nudgeVector(item: Item, key: ArrowKey): Vec {
		const room = store.room(item.roomId);
		const view = session.view === '3d' ? (viewer?.viewDirection() ?? null) : null;
		const vector = arrowVector(key, view, room?.boardPos.rot ?? 0);
		if (itemMount(item) !== 'wall' || !room) return vector;
		const normal = rotate({ x: 0, y: 1 }, item.rotation);
		const along = vector.x * normal.x + vector.y * normal.y;
		return { x: vector.x - along * normal.x, y: vector.y - along * normal.y };
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
		if (walking || isTyping(event.target)) return;
		const id = ui.selectedItemId;
		if (event.key === 'Escape') {
			if (id) {
				ui.selectedItemId = null;
				event.preventDefault();
				event.stopPropagation();
			}
			return;
		}
		if (!id || !selectedItem) return;
		const step = event.shiftKey ? 100 : 10;
		const arrow = ARROWS[event.key];
		if (arrow) {
			if (ownsArrows(event.target)) return;
			event.preventDefault();
			if (selectedItem.locked) return;
			const vector = nudgeVector(selectedItem, arrow);
			if (vector.x !== 0 || vector.y !== 0) nudgeItem(id, vector.x * step, vector.y * step);
			return;
		}
		switch (event.key) {
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				if (selectedItem.locked) toasts.show({ message: t(messages, 'lockedHint'), kind: 'info' });
				else deleteItem(id);
				break;
			case 'r':
			case 'R':
				event.preventDefault();
				rotateItem(id, event.shiftKey ? -90 : 90);
				break;
			case 'd':
			case 'D':
				event.preventDefault();
				duplicateItem(id);
				break;
		}
	}

	$effect(() => {
		window.addEventListener('keydown', onkeydown, true);
		return () => window.removeEventListener('keydown', onkeydown, true);
	});
</script>

<div class="absolute inset-0 flex flex-col bg-bg" data-testid="furnish-screen">
	<header
		class="z-20 shrink-0 border-b border-border bg-surface px-[max(0.5rem,var(--safe-left))] py-1.5 pr-[max(0.5rem,var(--safe-right))] [@media(max-height:520px)]:py-0.5"
	>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 md:flex-nowrap">
			<div class="flex w-full min-w-0 items-center gap-2 md:w-auto md:min-w-0 md:flex-1">
				<SegmentedControl
					items={viewItems}
					value={session.view}
					onchange={(value) => (session.view = value === '3d' ? '3d' : '2d')}
					label={t(messages, 'viewMode')}
					collapse
					class="shrink-0"
				/>
				<VariantBar class="min-w-0 flex-1" />
			</div>
			<div class="flex w-full min-w-0 items-center gap-1 md:w-auto md:shrink-0">
				<BudgetPill class="min-w-0 flex-1 md:w-80 md:flex-none" />
				<IconButton
					icon={Sofa}
					label={t(messages, 'tabCatalog')}
					variant="secondary"
					pressed={session.panelOpen && session.tab === 'catalog'}
					onclick={() => openPanel('catalog')}
					data-testid="open-catalog"
				/>
				<IconButton
					icon={ShoppingCart}
					label={t(messages, 'tabList')}
					variant="secondary"
					pressed={session.panelOpen && session.tab === 'list'}
					onclick={() => openPanel('list')}
					data-testid="open-list"
				/>
				<IconButton
					icon={ClipboardList}
					label={t(messages, 'tabBrief')}
					variant="secondary"
					pressed={session.panelOpen && session.tab === 'brief'}
					onclick={() => openPanel('brief')}
					data-testid="open-brief"
				/>
			</div>
		</div>
	</header>

	<div
		class="relative min-h-0 grow overflow-hidden"
		bind:clientHeight={areaHeight}
		bind:clientWidth={areaWidth}
	>
		{#if session.view === '2d'}
			<div class="absolute inset-0" data-furnish-board>
				<Board mode="furnish" />
			</div>
		{:else}
			<div class="absolute inset-0" data-furnish-viewer bind:this={host3d}>
				<Viewer3D
					roomId={ui.focusRoomId}
					toolbar
					{insets}
					onready={(created) => (viewer = created)}
					onroomchange={roomsChanged}
					onwalkchange={(active) => (walking = active)}
				/>
			</div>
		{/if}

		{#if rooms.length === 0 && store.project}
			<div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
				<div class="pointer-events-auto rounded-xl bg-surface/90 p-2 backdrop-blur">
					<EmptyState title={t(messages, 'noRoomTitle')} description={t(messages, 'noRoomText')} />
				</div>
			</div>
		{/if}

		{#if showBar}
			<div
				class="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 transition-[bottom] duration-(--duration-slow) ease-soft"
				style={barStyle}
			>
				<SelectionBar compact={barCompact} fine={session.view === '3d'} />
			</div>
		{/if}

		{#if !session.panelOpen}
			<Fab
				label={t(messages, 'tabCatalog')}
				icon={Plus}
				extended
				position="absolute"
				onclick={() => openPanel('catalog')}
				data-testid="catalog-fab"
			/>
		{/if}

		<SidePanel
			bind:open={session.panelOpen}
			bind:snap={session.snap}
			{title}
			closeLabel={t(common, 'close')}
		>
			<div class="sticky -top-1 z-10 -mx-5 -mt-1 mb-3 bg-surface px-5 pt-2 pb-2">
				<Tabs
					items={tabs}
					value={session.tab}
					label={t(messages, 'panelTabs')}
					onchange={(value) => (session.tab = value as PanelTabId)}
				/>
			</div>
			<div bind:this={panelBody}>
				{#if session.tab === 'catalog'}
					<CatalogPanel onadd={add} ondrop={drop} />
				{:else if session.tab === 'item'}
					<ItemEditor />
				{:else if session.tab === 'list'}
					<ShoppingList />
				{:else}
					<BriefEditor />
				{/if}
			</div>
		</SidePanel>
	</div>
</div>

<DragChip />
<CustomItemDialog bind:open={session.customOpen} />
