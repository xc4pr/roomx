<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Room, RoomElement } from '#lib/core/schema.ts';
	import { checkStairs } from '#lib/core/floors.ts';
	import { describeStairIssue } from '#lib/features/stairs/describe.ts';
	import { tourProgress } from '#lib/features/photos/tour.ts';
	import { common, elementKindNames } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { collectWarnings, isError, type CheckWarning } from './buildCheck.ts';
	import { messages } from './i18n.ts';

	interface Props {
		open: boolean;
		onproceed: () => void;
		title?: string;
		proceedLabel?: string;
		roomIds?: readonly string[];
	}

	let { open = $bindable(false), onproceed, title, proceedLabel, roomIds }: Props = $props();

	const warnings = $derived(
		open
			? collectWarnings(
					store.project?.rooms ?? [],
					tourProgress,
					roomIds,
					store.project ? checkStairs(store.project) : []
				)
			: []
	);

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
		if (warning.kind === 'stair') {
			return store.project ? describeStairIssue(store.project, warning.issue) : '';
		}
		const room = store.room(warning.roomId);
		if (!room) return '';
		if (warning.kind === 'unconnected') return t(messages, 'warnUnconnected', { room: room.name });
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
			case 'roofWindowOffSlope':
				return t(messages, 'warnRoofWindowOffSlope', { room: room.name });
			case 'elementNotForRoomType':
				return t(messages, 'warnElementNotForRoomType', { room: room.name, element: first });
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
		if (warning.kind === 'stair') {
			const stair = store.project?.stairs?.find(
				(candidate) => candidate.id === warning.issue.stairId
			);
			if (stair) {
				selectRoom(null);
				ui.floorId = stair.fromFloorId;
				ui.selectedStairId = stair.id;
			}
		}
		const id = store.project?.id;
		if (id && page.url.pathname !== resolve('/p/[id]', { id })) {
			void goto(resolve('/p/[id]', { id }));
		}
		if (warning.kind === 'stair') return;
		ui.panelTab =
			warning.kind === 'photos' ? 'photos' : warning.kind === 'unconnected' ? 'dims' : 'elements';
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
		title={title ?? t(messages, 'checkTitle')}
		description={warnings.length === 1
			? t(messages, 'checkIntroOne')
			: t(messages, 'checkIntroMany', { n: warnings.length })}
		closeLabel={t(common, 'close')}
		size="md"
	>
		<ul class="grid gap-2.5" data-testid="check-list">
			{#each warnings as warning, i (i)}
				<li
					class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg p-3.5 sm:flex {isError(
						warning
					)
						? 'bg-danger-soft'
						: 'bg-warning-soft'}"
					data-severity={isError(warning) ? 'error' : 'warning'}
				>
					<TriangleAlert
						class="size-6 shrink-0 {isError(warning) ? 'text-danger' : 'text-warning'}"
					/>
					<p class="min-w-0 grow text-base font-medium">{describe(warning)}</p>
					{#if warning.kind !== 'noRooms'}
						<Button
							variant="ghost"
							size="sm"
							icon={Eye}
							class="col-start-2 -ml-3.5 justify-self-start sm:ml-0"
							onclick={() => show(warning)}
						>
							{t(messages, 'checkShow')}
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
		{#snippet actions()}
			<Button variant="ghost" onclick={() => (open = false)}>{t(messages, 'checkBack')}</Button>
			<Button variant="primary" onclick={proceed} data-testid="check-proceed">
				{proceedLabel ?? t(messages, 'checkProceed')}
			</Button>
		{/snippet}
	</Dialog>
{/if}
