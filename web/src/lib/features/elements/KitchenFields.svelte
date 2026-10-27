<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import { KITCHEN_UPPER, kitchenGridWidth } from '#lib/core/defaults.ts';
	import { wall } from '#lib/core/geometry.ts';
	import { newId } from '#lib/core/ids.ts';
	import {
		KITCHEN_MODULE_KINDS,
		type KitchenGrid,
		type KitchenModule,
		type KitchenModuleKind,
		type KitchenRun
	} from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import {
		MODULE_APPLIANCES,
		changeModuleKind,
		appendModule,
		modulesTotal,
		moduleWidthChoices,
		moveModule,
		newModule,
		regrid,
		toggleAppliance
	} from './free.ts';
	import { messages } from './i18n.ts';
	import { MIN_WIDTH } from './logic.ts';

	let { roomId, run }: { roomId: string; run: KitchenRun } = $props();

	const total = $derived(modulesTotal(run.modules));

	function patch(values: Partial<Omit<KitchenRun, 'id' | 'kind'>>, name?: string): void {
		store.updateElement<KitchenRun>(
			roomId,
			run.id,
			values,
			name ? { coalesce: `ed-${run.id}-${name}` } : undefined
		);
	}

	function seal(): void {
		store.sealHistory();
	}

	function setModules(modules: KitchenModule[]): void {
		patch({ modules });
	}

	function replace(id: string, next: KitchenModule, name?: string): void {
		patch({ modules: run.modules.map((module) => (module.id === id ? next : module)) }, name);
	}

	function changeGrid(grid: KitchenGrid): void {
		if (grid === run.grid) return;
		patch({ grid, modules: regrid(run.modules, run.grid, grid) });
	}

	function toggleUpper(on: boolean): void {
		patch({ upper: on ? { ...KITCHEN_UPPER } : undefined });
	}

	function setUpper(values: Partial<NonNullable<KitchenRun['upper']>>, name: string): void {
		if (run.upper) patch({ upper: { ...run.upper, ...values } }, name);
	}

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	const gridItems = $derived([
		{ value: 'sms', label: t(messages, 'gridSms') },
		{ value: 'euro', label: t(messages, 'gridEuro') }
	]);
	const kindOptions = $derived(
		KITCHEN_MODULE_KINDS.map((kind) => ({ value: kind, label: t(messages, `module_${kind}`) }))
	);
</script>

<div class="flex flex-col gap-4" data-testid="kitchen-fields">
	<SegmentedControl
		full
		label={t(messages, 'kitchenGrid')}
		items={gridItems}
		value={run.grid}
		onchange={(value) => changeGrid(value as KitchenGrid)}
	/>

	<div class="grid grid-cols-2 gap-3">
		<NumberField
			stepper={false}
			label={t(messages, 'workHeight')}
			value={run.height}
			min={MIN_WIDTH}
			step={10}
			oninput={(mm) => patch({ height: mm }, 'work')}
			onchange={seal}
		/>
		<NumberField
			stepper={false}
			label={t(messages, 'tallHeight')}
			value={run.tallHeight}
			min={MIN_WIDTH}
			step={10}
			oninput={(mm) => patch({ tallHeight: mm }, 'tall')}
			onchange={seal}
		/>
	</div>

	<Switch
		checked={run.upper !== undefined}
		label={t(messages, 'upperCabinets')}
		onchange={toggleUpper}
	/>
	{#if run.upper}
		<div class="grid grid-cols-2 gap-3">
			<NumberField
				stepper={false}
				label={t(messages, 'upperDepth')}
				value={run.upper.depth}
				min={MIN_WIDTH}
				step={10}
				oninput={(mm) => setUpper({ depth: mm }, 'ud')}
				onchange={seal}
			/>
			<NumberField
				stepper={false}
				label={t(messages, 'upperHeight')}
				value={run.upper.height}
				min={MIN_WIDTH}
				step={10}
				oninput={(mm) => setUpper({ height: mm }, 'uh')}
				onchange={seal}
			/>
			<NumberField
				stepper={false}
				label={t(messages, 'upperElevation')}
				value={run.upper.elevation}
				min={0}
				step={10}
				oninput={(mm) => setUpper({ elevation: mm }, 'ue')}
				onchange={seal}
			/>
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2 px-1">
			<h4 class="text-sm font-bold">{t(messages, 'modules')}</h4>
			<span
				class="text-xs pointer-coarse:text-sm {total > run.width ? 'text-warning' : 'text-muted'}"
			>
				{t(messages, 'moduleTotal', { used: format(total), total: format(run.width) })}
			</span>
		</div>
		{#if total > run.width}
			<p class="rounded-md bg-warning-soft p-2.5 text-sm text-warning">
				{t(messages, 'moduleOver')}
			</p>
		{:else if total < run.width}
			<p class="px-1 text-xs text-muted pointer-coarse:text-sm">{t(messages, 'moduleRest')}</p>
		{/if}

		<ul class="flex flex-col gap-2">
			{#each run.modules as module, index (module.id)}
				{@const allowed = MODULE_APPLIANCES[module.kind]}
				<li
					class="flex flex-col gap-3 rounded-md border border-border bg-surface-2 p-3"
					data-module={module.id}
				>
					<div class="flex items-center gap-1">
						<span class="min-w-0 flex-1 truncate text-sm font-semibold">
							{t(messages, 'moduleHeading', {
								n: index + 1,
								kind: t(messages, `module_${module.kind}`)
							})}
						</span>
						<IconButton
							icon={ChevronUp}
							label={t(messages, 'moduleEarlier')}
							variant="ghost"
							disabled={index === 0}
							onclick={() => setModules(moveModule(run.modules, module.id, -1))}
						/>
						<IconButton
							icon={ChevronDown}
							label={t(messages, 'moduleLater')}
							variant="ghost"
							disabled={index === run.modules.length - 1}
							onclick={() => setModules(moveModule(run.modules, module.id, 1))}
						/>
						<IconButton
							icon={Trash}
							label={t(messages, 'moduleRemove')}
							variant="danger"
							onclick={() => setModules(run.modules.filter((other) => other.id !== module.id))}
						/>
					</div>
					<Select
						label={t(messages, 'moduleKind')}
						options={kindOptions}
						value={module.kind}
						onchange={(value) =>
							replace(module.id, changeModuleKind(module, value as KitchenModuleKind))}
					/>
					<NumberField
						stepper={false}
						label={t(messages, 'moduleWidth')}
						value={module.width}
						min={MIN_WIDTH}
						step={kitchenGridWidth(run.grid) / 10}
						oninput={(mm) => replace(module.id, { ...module, width: mm }, `mw-${module.id}`)}
						onchange={seal}
					/>
					<div class="flex flex-wrap gap-2">
						{#each moduleWidthChoices(run.grid) as choice (choice)}
							<Chip
								selected={module.width === choice}
								onclick={() => replace(module.id, { ...module, width: choice })}
							>
								{format(choice)}
							</Chip>
						{/each}
					</div>
					{#if allowed.length > 0}
						<div class="flex flex-col gap-1.5">
							<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'appliances')}</span>
							<div class="flex flex-wrap gap-2">
								{#each allowed as appliance (appliance)}
									<Chip
										selected={module.appliances?.includes(appliance) ?? false}
										onclick={() => replace(module.id, toggleAppliance(module, appliance))}
									>
										{t(messages, `appliance_${appliance}`)}
									</Chip>
								{/each}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="flex flex-wrap gap-2">
			<Button
				variant="secondary"
				icon={Plus}
				onclick={() => {
					const target = wall(store.room(roomId)?.polygon ?? [], run.wall);
					patch(appendModule(run, target?.length ?? run.width, newModule('base', run.grid, newId)));
				}}
				data-testid="module-add"
			>
				{t(messages, 'moduleAdd')}
			</Button>
		</div>
	</div>
</div>
