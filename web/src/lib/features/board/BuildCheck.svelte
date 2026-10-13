<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { untrack } from 'svelte';
	import type { Room, RoomElement } from '#lib/core/schema.ts';
	import { tourProgress } from '#lib/features/photos/tour.ts';
	import { common, elementKindNames } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { collectWarnings, type CheckWarning } from './buildCheck.ts';
	import { messages } from './i18n.ts';

	let { open = $bindable(false), onproceed }: { open: boolean; onproceed: () => void } = $props();

	const warnings = $derived(open ? collectWarnings(store.project?.rooms ?? [], tourProgress) : []);

	$effect(() => {
		if (!open) return;
		if (warnings.length === 0) {
			open = false;
			untrack(onproceed);
		}
	});

	function elementLabel(room: Room, id: string): string {
		const element = room.elements.find((candidate) => candidate.id === id);
		if (!element) return t(messages, 'unknownElement');
		const name = t(elementKindNames, element.kind);
		const same = room.elements.filter((candidate: RoomElement) => candidate.kind === element.kind);
		return same.length > 1 ? `${name} ${same.indexOf(element) + 1}` : name;
	}

	function describe(warning: CheckWarning): string {
		if (warning.kind === 'noRooms') return t(messages, 'warnNoRooms');
		const room = store.room(warning.roomId);
		if (!room) return '';
		if (warning.kind === 'photos') {
			return t(messages, 'warnPhotos', {
				room: room.name,
				done: warning.done,
				total: warning.total
			});
		}
		const { issue } = warning;
		const first = issue.elementIds[0] ? elementLabel(room, issue.elementIds[0]) : '';
		switch (issue.code) {
			case 'polygonInvalid':
				return t(messages, 'warnPolygon', { room: room.name });
			case 'elementOutsideWall':
				return issue.wall === undefined
					? t(messages, 'warnOutsideRoom', { room: room.name, element: first })
					: t(messages, 'warnOutsideWall', {
							room: room.name,
							element: first,
							wall: issue.wall
						});
			case 'elementTooHigh':
				return t(
					messages,
					room.slopes && room.slopes.length > 0 ? 'warnTooHighSlope' : 'warnTooHigh',
					{
						room: room.name,
						element: first,
						wall: issue.wall ?? 0
					}
				);
			case 'elementOverlap':
				return t(messages, 'warnOverlap', {
					room: room.name,
					a: first,
					b: issue.elementIds[1] ? elementLabel(room, issue.elementIds[1]) : '',
					wall: issue.wall ?? 0
				});
		}
	}

	function show(warning: CheckWarning): void {
		if (warning.kind === 'noRooms') {
			open = false;
			return;
		}
		open = false;
		ui.panelTab = warning.kind === 'photos' ? 'photos' : 'elements';
		selectRoom(warning.roomId);
		if (warning.kind === 'issue' && warning.issue.elementIds[0]) {
			ui.selectedElementId = warning.issue.elementIds[0];
		}
		if (warning.kind === 'issue' && warning.issue.code === 'polygonInvalid') ui.panelTab = 'dims';
	}

	function proceed(): void {
		open = false;
		onproceed();
	}
</script>

{#if warnings.length > 0}
	<Dialog
		bind:open
		title={t(messages, 'checkTitle')}
		description={warnings.length === 1
			? t(messages, 'checkIntroOne')
			: t(messages, 'checkIntroMany', { n: warnings.length })}
		closeLabel={t(common, 'close')}
		size="md"
	>
		<ul class="grid gap-2.5" data-testid="check-list">
			{#each warnings as warning, i (i)}
				<li class="flex items-center gap-3 rounded-lg bg-warning-soft p-3.5">
					<TriangleAlert class="size-6 shrink-0 text-warning" />
					<p class="min-w-0 grow text-base font-medium">{describe(warning)}</p>
					{#if warning.kind !== 'noRooms'}
						<Button variant="ghost" size="sm" icon={Eye} onclick={() => show(warning)}>
							{t(messages, 'checkShow')}
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
		{#snippet actions()}
			<Button variant="ghost" onclick={() => (open = false)}>{t(messages, 'checkBack')}</Button>
			<Button variant="primary" onclick={proceed} data-testid="check-proceed">
				{t(messages, 'checkProceed')}
			</Button>
		{/snippet}
	</Dialog>
{/if}
