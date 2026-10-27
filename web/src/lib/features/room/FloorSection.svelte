<script lang="ts">
	import { floorsEnabled, roomFloorId } from '#lib/core/floors.ts';
	import type { Room } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Select from '#lib/ui/Select.svelte';
	import { messages } from './i18n.ts';

	let { room }: { room: Room } = $props();

	const project = $derived(store.project);
	const floors = $derived(project?.floors ?? []);
	const current = $derived(project ? (roomFloorId(project, room) ?? '') : '');

	function change(floorId: string): void {
		if (floorId === current) return;
		store.updateRoom(room.id, { floorId });
		ui.floorId = floorId;
	}
</script>

{#if project && floorsEnabled(project)}
	<div data-testid="room-floor">
		<Select
			label={t(messages, 'roomFloor')}
			options={floors.map((floor) => ({ value: floor.id, label: floor.name }))}
			value={current}
			onchange={change}
		/>
	</div>
{/if}
