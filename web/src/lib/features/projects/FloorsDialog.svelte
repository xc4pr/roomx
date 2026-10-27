<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import {
		floorClearHeight,
		floorsEnabled,
		canDisableFloors,
		suggestFloorName
	} from '#lib/core/floors.ts';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { DEFAULT_MULTI, floorRemovable, insertIndex, unusedFloorNames } from './floors.ts';
	import { messages } from './i18n.ts';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const project = $derived(store.project);
	const enabled = $derived(project ? floorsEnabled(project) : false);
	const canSwitchOff = $derived(project ? canDisableFloors(project) : false);
	const floors = $derived(project?.floors ?? []);
	const unused = $derived(project ? unusedFloorNames(project) : []);

	function toggle(on: boolean): void {
		if (on) store.enableFloors([...DEFAULT_MULTI]);
		else store.disableFloors();
	}

	function add(name: string): void {
		if (!project) return;
		store.addFloor(name, insertIndex(project, name));
	}
</script>

<Dialog bind:open title={t(messages, 'floorsTitle')} closeLabel={t(common, 'close')} size="md">
	<div class="grid gap-4" data-testid="floors-dialog">
		<Switch
			checked={enabled}
			label={t(messages, 'floorsSwitch')}
			description={enabled && !canSwitchOff
				? t(messages, 'floorsKeepHint')
				: t(messages, 'floorsSwitchHint')}
			disabled={enabled && !canSwitchOff}
			onchange={toggle}
		/>

		{#if enabled && project}
			<ul class="grid gap-3">
				{#each [...floors].reverse() as floor (floor.id)}
					{@const index = floors.indexOf(floor)}
					<li
						class="grid gap-3 rounded-lg border border-border p-3"
						data-testid="floor-row-{index}"
					>
						<div class="flex items-end gap-2">
							<TextField
								class="min-w-0 grow"
								label={t(messages, 'floorName')}
								value={floor.name}
								maxlength={30}
								oninput={(name) =>
									store.updateFloor(floor.id, { name }, { coalesce: `floor-name-${floor.id}` })}
								onchange={() => store.sealHistory()}
							/>
							<IconButton
								icon={ArrowUp}
								label={t(messages, 'floorUp')}
								disabled={index === floors.length - 1}
								onclick={() => store.moveFloor(floor.id, index + 1)}
							/>
							<IconButton
								icon={ArrowDown}
								label={t(messages, 'floorDown')}
								disabled={index === 0}
								onclick={() => store.moveFloor(floor.id, index - 1)}
							/>
							<IconButton
								icon={Trash2}
								variant="danger"
								label={t(messages, 'floorRemove')}
								disabled={!floorRemovable(project, floor.id)}
								onclick={() => store.removeFloor(floor.id)}
							/>
						</div>
						<div class="grid gap-3">
							<NumberField
								label={t(messages, 'floorSlab')}
								value={floor.slabThickness}
								min={100}
								max={800}
								step={10}
								stepper
								oninput={(mm) =>
									store.updateFloor(
										floor.id,
										{ slabThickness: mm },
										{ coalesce: `floor-slab-${floor.id}` }
									)}
								onchange={() => store.sealHistory()}
							/>
							<div class="grid gap-1.5">
								<NumberField
									label={t(messages, 'floorHeight')}
									value={floor.height ?? floorClearHeight(project, floor)}
									min={2000}
									max={6000}
									step={10}
									stepper
									oninput={(mm) =>
										store.updateFloor(
											floor.id,
											{ height: mm },
											{ coalesce: `floor-height-${floor.id}` }
										)}
									onchange={() => store.sealHistory()}
								/>
								<Chip
									selected={floor.height === undefined}
									class="justify-self-start"
									onclick={() => store.updateFloor(floor.id, { height: undefined })}
								>
									{t(messages, 'floorHeightAuto')}
								</Chip>
							</div>
						</div>
					</li>
				{/each}
			</ul>

			<div class="grid gap-2">
				<div class="flex flex-wrap gap-2">
					{#each unused as name (name)}
						<Chip onclick={() => add(name)} icon={Plus}>{name}</Chip>
					{/each}
					{#if unused.length === 0}
						<Button variant="secondary" icon={Plus} onclick={() => add(suggestFloorName(project))}>
							{t(messages, 'floorAdd')}
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	{#snippet actions()}
		<Button variant="primary" onclick={() => (open = false)}>{t(common, 'close')}</Button>
	{/snippet}
</Dialog>
