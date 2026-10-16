<script lang="ts">
	import { ITEM_CATEGORIES, type ItemCategory } from '#lib/core/schema.ts';
	import { categoryNames, common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { currentRoom, insertItem } from './actions.ts';
	import { messages } from './i18n.ts';
	import { CUSTOM_COLORS, customItem } from './place.ts';
	import { parsePrice } from './format.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state('');
	let category = $state<ItemCategory>('sofa');
	let w = $state(2000);
	let d = $state(900);
	let h = $state(800);
	let color = $state<string>(CUSTOM_COLORS[0]);
	let price = $state('');
	let powered = $state(false);

	const categoryList = $derived(
		ITEM_CATEGORIES.map((value) => ({ value, label: t(categoryNames, value) }))
	);

	function submit(): void {
		const room = currentRoom();
		if (!room) {
			toasts.show({ message: t(messages, 'noRoom'), kind: 'error' });
			return;
		}
		const label = name.trim() || t(categoryNames, category);
		const priceChf = parsePrice(price);
		const id = insertItem(
			customItem(
				{
					name: label,
					category,
					dims: { w, d, h },
					color,
					powered,
					...(priceChf !== undefined ? { priceChf } : {})
				},
				room.id
			),
			room
		);
		// At the furniture limit the store shows why; the dialog keeps the entries.
		if (!id) return;
		open = false;
		name = '';
		price = '';
	}
</script>

<Dialog
	bind:open
	title={t(messages, 'customTitle')}
	description={t(messages, 'customText')}
	closeLabel={t(common, 'close')}
	size="md"
>
	<form
		class="flex flex-col gap-4"
		onsubmit={(event) => {
			event.preventDefault();
			submit();
		}}
	>
		<TextField
			bind:value={name}
			label={t(messages, 'name')}
			placeholder={t(messages, 'customNamePlaceholder')}
			maxlength={60}
			data-testid="custom-name"
		/>
		<Select
			options={categoryList}
			bind:value={category as string}
			label={t(messages, 'category')}
		/>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<NumberField
				value={w}
				label={t(messages, 'width')}
				min={50}
				max={8000}
				step={50}
				stepper={false}
				oninput={(mm) => (w = mm)}
			/>
			<NumberField
				value={d}
				label={t(messages, 'depth')}
				min={50}
				max={8000}
				step={50}
				stepper={false}
				oninput={(mm) => (d = mm)}
			/>
			<NumberField
				value={h}
				label={t(messages, 'height')}
				min={10}
				max={4000}
				step={50}
				stepper={false}
				oninput={(mm) => (h = mm)}
			/>
		</div>
		<fieldset class="flex flex-col gap-2">
			<legend class="text-sm font-semibold">{t(messages, 'color')}</legend>
			<div class="flex flex-wrap items-center gap-2">
				{#each CUSTOM_COLORS as swatch (swatch)}
					<button
						type="button"
						class="size-11 rounded-full border-2 transition duration-(--duration-fast) ease-soft active:scale-90 {color ===
						swatch
							? 'border-accent ring-2 ring-accent/40'
							: 'border-border'}"
						style="background: {swatch}"
						aria-label={swatch}
						aria-pressed={color === swatch}
						onclick={() => (color = swatch)}
					></button>
				{/each}
				<label
					class="relative inline-flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border"
				>
					<span class="sr-only">{t(messages, 'customColor')}</span>
					<input
						type="color"
						value={color}
						class="absolute inset-0 size-full cursor-pointer opacity-0"
						oninput={(event) => (color = event.currentTarget.value)}
					/>
					<span class="text-lg text-muted">+</span>
				</label>
			</div>
		</fieldset>
		<TextField
			bind:value={price}
			label={t(messages, 'priceChf')}
			hint={t(messages, 'priceHint')}
			inputmode="decimal"
			maxlength={9}
		/>
		<Switch
			bind:checked={powered}
			label={t(messages, 'powered')}
			description={t(messages, 'poweredHint')}
		/>
		<button type="submit" class="sr-only" tabindex="-1">{t(messages, 'addToRoom')}</button>
	</form>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (open = false)}>{t(common, 'cancel')}</Button>
		<Button variant="primary" onclick={submit} data-testid="custom-submit">
			{t(messages, 'addToRoom')}
		</Button>
	{/snippet}
</Dialog>
