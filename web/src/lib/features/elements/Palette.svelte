<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { FREE_ELEMENT_KINDS, type ElementKind } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { messages } from './i18n.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { paletteSections } from './free.ts';
	import { KIND_ICONS, kindColor } from './kinds.ts';
	import { endPaletteDrag, session } from './session.svelte.ts';

	let { roomId }: { roomId: string } = $props();

	const DRAG_THRESHOLD = 8;

	const room = $derived(store.room(roomId));
	const sections = $derived(room ? paletteSections(room) : []);

	function hint(kind: ElementKind): string {
		if (kind === 'ceilingLamp') return t(messages, 'placeHintCeiling');
		if (kind === 'roofWindow') return t(messages, 'placeHintSlope');
		return FREE_ELEMENT_KINDS.includes(kind as (typeof FREE_ELEMENT_KINDS)[number])
			? t(messages, 'placeHintFree')
			: t(messages, 'placeHint');
	}

	let press: { kind: ElementKind; pointerId: number; x: number; y: number } | null = null;
	let suppressClick = false;

	function toggle(kind: ElementKind): void {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		ui.placingKind = ui.placingKind === kind ? null : kind;
		ui.selectedElementId = null;
	}

	function down(event: PointerEvent, kind: ElementKind): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		press = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	}

	function move(event: PointerEvent): void {
		if (!press || event.pointerId !== press.pointerId) return;
		if (!session.dragKind) {
			if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
			session.dragKind = press.kind;
			session.dragRoomId = roomId;
			ui.placingKind = null;
		}
		session.pointer = { clientX: event.clientX, clientY: event.clientY };
	}

	function up(event: PointerEvent): void {
		if (!press || event.pointerId !== press.pointerId) return;
		const kind = press.kind;
		const wasDragging = session.dragKind !== null;
		press = null;
		if (!wasDragging) return;
		suppressClick = true;
		const hit = document.elementFromPoint(event.clientX, event.clientY);
		endPaletteDrag();
		if (hit?.closest('svg')) {
			session.drop = { kind, roomId, clientX: event.clientX, clientY: event.clientY };
		}
		setTimeout(() => (suppressClick = false), 0);
	}

	function cancel(event: PointerEvent): void {
		if (!press || event.pointerId !== press.pointerId) return;
		press = null;
		endPaletteDrag();
	}
</script>

<section class="flex flex-col gap-3" data-testid="element-palette">
	{#each sections as section (section.group)}
		<div class="flex flex-col gap-1.5" data-group={section.group}>
			{#if sections.length > 1}
				<h4
					class="px-1 text-xs font-bold tracking-wide text-muted uppercase pointer-coarse:text-sm"
				>
					{t(messages, `group_${section.group}`)}
				</h4>
			{/if}
			<div class="grid grid-cols-5 gap-1.5 pointer-coarse:grid-cols-4">
				{#each section.kinds as kind (kind)}
					{@const Icon = KIND_ICONS[kind]}
					<button
						type="button"
						aria-pressed={ui.placingKind === kind}
						data-kind={kind}
						onclick={() => toggle(kind)}
						onpointerdown={(event) => down(event, kind)}
						onpointermove={move}
						onpointerup={up}
						onpointercancel={cancel}
						class="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[11px] leading-tight font-semibold transition duration-(--duration-fast) ease-soft select-none active:scale-95 pointer-coarse:text-sm {ui.placingKind ===
						kind
							? 'border-accent bg-accent-soft text-accent'
							: 'border-border bg-surface text-text hover:bg-surface-2'}"
						style="touch-action: none; -webkit-touch-callout: none; user-select: none"
					>
						<span style="color: {ui.placingKind === kind ? 'inherit' : kindColor(kind)}">
							<Icon class="size-6" />
						</span>
						<span class="w-full truncate text-center">{t(messages, `short_${kind}`)}</span>
					</button>
				{/each}
			</div>
		</div>
	{/each}

	{#if ui.placingKind}
		<div
			class="flex animate-fade-in items-center gap-2 rounded-md bg-accent-soft p-2 pl-3 text-sm font-semibold text-accent"
			role="status"
		>
			<span class="min-w-0 flex-1">
				{hint(ui.placingKind)}
			</span>
			<IconButton
				icon={X}
				label={t(messages, 'cancelPlacing')}
				variant="ghost"
				onclick={() => (ui.placingKind = null)}
			/>
		</div>
	{/if}

	<Switch
		checked={ui.electricalLayer}
		label={t(messages, 'electricalLayer')}
		description={t(messages, 'electricalLayerHint')}
		onchange={(checked) => (ui.electricalLayer = checked)}
	/>
</section>
