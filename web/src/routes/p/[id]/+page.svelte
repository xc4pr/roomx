<script lang="ts">
	import Board from '#lib/features/board/Board.svelte';
	import { panel } from '#lib/features/board/panel.svelte.ts';
	import MirrorButton from '#lib/features/mirror/MirrorButton.svelte';
	import RoomPanel from '#lib/features/room/RoomPanel.svelte';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import { PHONE_PORTRAIT_QUERY } from '#lib/ui/layout.ts';
	import { media } from '#lib/ui/media.svelte.ts';
	import SidePanel from '#lib/ui/SidePanel.svelte';

	const phone = media(PHONE_PORTRAIT_QUERY);
	const roomIds = $derived(store.project?.rooms.map((room) => room.id) ?? []);
</script>

<div class="absolute inset-0 overflow-hidden">
	<div class="absolute inset-0">
		<Board mode="build" />
	</div>
	{#if !ui.selectedRoomId && !phone.matches && roomIds.length > 0}
		<div
			class="absolute bottom-[max(1rem,var(--safe-bottom))] left-[max(0.75rem,var(--safe-left))] z-10"
		>
			<MirrorButton {roomIds} size="sm" class="shadow-soft" />
		</div>
	{/if}
	{#if ui.selectedRoomId}
		<SidePanel
			open
			bind:snap={panel.snap}
			scrollKey={`${ui.selectedRoomId}:${ui.panelTab}`}
			title={store.room(ui.selectedRoomId)?.name ?? ''}
			closeLabel={t(common, 'close')}
			onclose={() => selectRoom(null)}
		>
			<RoomPanel roomId={ui.selectedRoomId} />
		</SidePanel>
	{/if}
</div>
