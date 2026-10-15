<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { RETAILERS } from '#lib/catalog/retailers.ts';
	import type { Brief, Workstation } from '#lib/core/schema.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { emptyBrief } from './actions.ts';
	import { parsePrice } from './format.ts';
	import { messages } from './i18n.ts';
	import { retailerChips, toggleRetailer } from './retailerChips.ts';
	import Stepper from './Stepper.svelte';

	const BED_SIZES = ['90×200', '140×200', '160×200', '180×200', '200×200'];

	const brief = $derived(store.project?.brief ?? emptyBrief());
	const bedSizes = $derived([...new Set([...BED_SIZES, ...brief.bedSizes])]);
	const retailers = $derived(retailerChips(RETAILERS, brief.retailers));
	const computerOptions = $derived([
		{ value: 'none', label: t(messages, 'computer_none') },
		{ value: 'laptop', label: t(messages, 'computer_laptop') },
		{ value: 'pc', label: t(messages, 'computer_pc') },
		{ value: 'both', label: t(messages, 'computer_both') }
	]);

	function update(change: (next: Brief) => void): void {
		const next = structuredClone($state.snapshot(brief)) as Brief;
		change(next);
		store.setBrief(next);
	}

	function toggle(list: string[] | undefined, value: string): string[] {
		const current = list ?? [];
		return current.includes(value)
			? current.filter((entry) => entry !== value)
			: [...current, value];
	}

	function setWorkstation(index: number, change: (entry: Workstation) => void): void {
		update((next) => {
			const entry = next.workstations[index];
			if (entry) change(entry);
		});
	}

	function optional(value: string): string | undefined {
		return value.trim() === '' ? undefined : value.trim();
	}
</script>

<div class="flex flex-col gap-5" data-testid="brief-editor">
	<p class="text-sm text-muted">{t(messages, 'briefIntro')}</p>

	<section class="flex flex-col gap-3">
		<h3 class="text-sm font-bold">{t(messages, 'persons')}</h3>
		<Stepper
			label={t(messages, 'adults')}
			value={brief.persons.adults}
			decreaseLabel={t(messages, 'less')}
			increaseLabel={t(messages, 'more')}
			onchange={(value) => update((next) => (next.persons.adults = value))}
		/>
		<Stepper
			label={t(messages, 'children')}
			value={brief.persons.children}
			decreaseLabel={t(messages, 'less')}
			increaseLabel={t(messages, 'more')}
			onchange={(value) => update((next) => (next.persons.children = value))}
		/>
		<TextField
			value={brief.persons.pets ?? ''}
			label={t(messages, 'pets')}
			maxlength={80}
			onchange={(value) => update((next) => (next.persons.pets = optional(value)))}
		/>
	</section>

	<section class="flex flex-col gap-2">
		<h3 class="text-sm font-bold">{t(messages, 'bedSizes')}</h3>
		<div class="flex flex-wrap gap-2">
			{#each bedSizes as size (size)}
				<Chip
					selected={brief.bedSizes.includes(size)}
					onclick={() => update((next) => (next.bedSizes = toggle(next.bedSizes, size)))}
				>
					{size}
				</Chip>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h3 class="text-sm font-bold">{t(messages, 'workstations')}</h3>
		{#each brief.workstations as station, index (index)}
			<div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-semibold">{t(messages, 'workstation', { n: index + 1 })}</span>
					<IconButton
						icon={Trash2}
						label={t(messages, 'removeWorkstation')}
						variant="ghost"
						onclick={() => update((next) => next.workstations.splice(index, 1))}
					/>
				</div>
				<Stepper
					label={t(messages, 'monitors')}
					value={station.monitors}
					max={6}
					decreaseLabel={t(messages, 'less')}
					increaseLabel={t(messages, 'more')}
					onchange={(value) => setWorkstation(index, (entry) => (entry.monitors = value))}
				/>
				<Select
					options={computerOptions}
					value={station.computer ?? 'none'}
					label={t(messages, 'computer')}
					onchange={(value) =>
						setWorkstation(index, (entry) => {
							if (value === 'none') delete entry.computer;
							else entry.computer = value as 'laptop' | 'pc' | 'both';
						})}
				/>
				<Switch
					checked={station.sitStand === true}
					label={t(messages, 'sitStand')}
					onchange={(checked) =>
						setWorkstation(index, (entry) => {
							if (checked) entry.sitStand = true;
							else delete entry.sitStand;
						})}
				/>
			</div>
		{/each}
		<Button
			variant="secondary"
			icon={Plus}
			onclick={() => update((next) => next.workstations.push({ monitors: 1, computer: 'laptop' }))}
		>
			{t(messages, 'addWorkstation')}
		</Button>
	</section>

	<section class="flex flex-col gap-3">
		<TextField
			value={brief.style ?? ''}
			label={t(messages, 'style')}
			placeholder={t(messages, 'stylePlaceholder')}
			maxlength={80}
			onchange={(value) => update((next) => (next.style = optional(value)))}
		/>
		<TextField
			value={brief.budgetChf === undefined ? '' : String(brief.budgetChf).replace('.', ',')}
			label={t(messages, 'budget')}
			hint={t(messages, 'budgetHint')}
			inputmode="decimal"
			maxlength={9}
			onchange={(value) => update((next) => (next.budgetChf = parsePrice(value)))}
			data-testid="brief-budget"
		/>
	</section>

	<section class="flex flex-col gap-2">
		<h3 class="text-sm font-bold">{t(messages, 'retailers')}</h3>
		<div class="flex flex-wrap gap-2">
			{#each retailers as chip (chip.label)}
				<Chip
					selected={chip.selected}
					onclick={() =>
						update((next) => {
							const list = toggleRetailer(next.retailers, chip.label);
							if (list.length > 0) next.retailers = list;
							else delete next.retailers;
						})}
				>
					{chip.label}
				</Chip>
			{/each}
		</div>
	</section>

	<div class="flex flex-col gap-1.5">
		<label for="brief-wishes" class="px-1 text-sm font-semibold text-muted">
			{t(messages, 'wishes')}
		</label>
		<textarea
			id="brief-wishes"
			rows="4"
			maxlength={1000}
			class="min-h-24 resize-y rounded-md border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
			value={brief.wishes ?? ''}
			onchange={(event) => update((next) => (next.wishes = optional(event.currentTarget.value)))}
		></textarea>
	</div>
</div>
