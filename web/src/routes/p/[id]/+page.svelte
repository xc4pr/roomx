<script lang="ts">
	import Board from '#lib/features/board/Board.svelte';
	import { panel } from '#lib/features/board/panel.svelte.ts';
	import RoomPanel from '#lib/features/room/RoomPanel.svelte';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import SidePanel from '#lib/ui/SidePanel.svelte';
</script>

<div class="absolute inset-0 overflow-hidden">
	<div class="absolute inset-0">
		<Board mode="build" />
	</div>
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
