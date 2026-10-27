<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
	import { lookup } from '#lib/catalog/index.ts';
	import { checkRoomItems, type ItemIssue } from '#lib/core/checks.ts';
	import type { Item } from '#lib/core/schema.ts';
	import { connections } from '#lib/features/board/connections.svelte.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { categoryNames } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { deleteItem, duplicateItem, itemLabel, rotateItem } from './actions.ts';
	import { parseDegrees, parseLinkInput, parsePrice } from './format.ts';
	import { messages } from './i18n.ts';
	import { narrowPassages } from './passage.ts';
	import { CUSTOM_COLORS } from './place.ts';
	import { pricesAsOf } from './priceDate.ts';

	let linkError = $state(false);

	const item = $derived(ui.selectedItemId ? store.item(ui.selectedItemId) : undefined);
	const room = $derived(item ? store.room(item.roomId) : undefined);
	const entry = $derived(item?.catalogId ? lookup(item.catalogId) : undefined);
	const carrier = $derived(item?.onItemId ? store.item(item.onItemId) : undefined);
	const custom = $derived(item !== undefined && item.catalogId === undefined);
	const locked = $derived(item?.locked === true);
	const palette = $derived(entry ? entry.colors : [...CUSTOM_COLORS]);

	const hints = $derived.by(() => {
		if (!item || !room) return [];
		const items = store.roomItems(room.id);
		const suggestions = (store.activeVariant?.suggestions ?? [])
			.filter((suggestion) => suggestion.roomId === room.id)
			.map((suggestion) => suggestion.element);
		const issues = checkRoomItems(
			connections.withNeighbourOpenings(room),
			items,
			suggestions
		).filter((issue) => issue.itemIds.includes(item.id));
		const lines = issues.map((issue) => ({
			text: describe(issue, item),
			severity: issue.severity
		}));
		for (const passage of narrowPassages(room, items)) {
			if (passage.itemIds.includes(item.id)) {
				lines.push({
					text: t(messages, 'hint_narrow', { gap: format(passage.gap) }),
					severity: 'warning'
				});
			}
		}
		return lines;
	});

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function describe(issue: ItemIssue, self: Item): string {
		const other = issue.itemIds.find((id) => id !== self.id);
		const name = other ? itemLabel(store.item(other) ?? { name: '' }) : '';
		switch (issue.code) {
			case 'outsideRoom':
				return t(messages, 'hint_outsideRoom');
			case 'tooTall':
				return t(messages, 'hint_tooTall');
			case 'underSlope':
				return t(messages, 'hint_underSlope');
			case 'collision':
				return t(messages, 'hint_collision', { name });
			case 'elementCollision':
				return t(messages, 'hint_elementCollision');
			case 'doorBlocked':
				return t(messages, 'hint_doorBlocked');
			case 'windowBlocked':
				return t(messages, 'hint_windowBlocked');
			case 'radiatorBlocked':
				return t(messages, 'hint_radiatorBlocked');
			case 'fireZone':
				return t(messages, 'hint_fireZone');
			case 'airflowBlocked':
				return t(messages, 'hint_airflowBlocked');
			case 'onStair':
				return t(messages, 'hint_onStair');
			case 'inStairwell':
				return t(messages, 'hint_inStairwell');
			case 'socketFar':
				return issue.distance === undefined
					? t(messages, 'hint_noSocket')
					: t(messages, 'hint_socketFar', { distance: format(issue.distance) });
		}
	}

	$effect(() => {
		void item?.id;
		linkError = false;
	});

	function saveLink(text: string): void {
		const parsed = parseLinkInput(text);
		linkError = parsed.kind === 'invalid';
		if (parsed.kind === 'invalid') return;
		patch({ url: parsed.kind === 'ok' ? parsed.url : undefined });
	}

	function patch(values: Partial<Record<keyof Item, unknown>>, key?: string): void {
		const id = item?.id;
		if (!id) return;
		store.mutate(
			(project) => {
				const target = project.variants
					.find((variant) => variant.id === project.activeVariantId)
					?.items.find((candidate) => candidate.id === id);
				if (!target) return;
				const record = target as unknown as Record<string, unknown>;
				for (const [name, value] of Object.entries(values)) {
					if (value === undefined) delete record[name];
					else record[name] = value;
				}
			},
			key ? { coalesce: `${key}-${id}` } : undefined
		);
	}

	function seal(): void {
		store.sealHistory();
	}

	function setDim(name: 'w' | 'd' | 'h', mm: number): void {
		if (!item) return;
		patch({ dims: { ...item.dims, [name]: Math.max(10, mm) } }, `dim-${name}`);
	}

	function unstack(): void {
		if (!item || !carrier) return;
		patch({ onItemId: undefined, elevation: 0 });
	}
</script>

{#if !item || !room}
	<EmptyState
		icon={SquareDashed}
		title={t(messages, 'noSelection')}
		description={t(messages, 'noSelectionText')}
	/>
{:else}
	{#key item.id}
		<div class="flex flex-col gap-4 pb-2" data-testid="item-editor">
			<div class="flex flex-col gap-1">
				<TextField
					value={itemLabel(item)}
					label={t(messages, 'name')}
					maxlength={80}
					oninput={(value) => patch({ name: value }, 'name')}
					onchange={seal}
					data-testid="item-name"
				/>
				<p class="px-1 text-xs text-muted pointer-coarse:text-sm">
					{room.name} · {t(categoryNames, item.category)}{entry
						? ` · ${entry.series ?? entry.brand}`
						: ` · ${t(messages, 'custom')}`}
				</p>
			</div>

			{#if hints.length > 0}
				<ul class="flex flex-col gap-1.5" aria-label={t(messages, 'hints')}>
					{#each hints as hint, i (i)}
						<li
							class="flex items-start gap-2 rounded-md px-3 py-2 text-sm font-medium {hint.severity ===
							'error'
								? 'bg-danger-soft text-danger'
								: 'bg-warning-soft text-text'}"
						>
							<TriangleAlert
								class="mt-0.5 size-4 shrink-0 {hint.severity === 'error'
									? 'text-danger'
									: 'text-warning'}"
							/>
							<span>{hint.text}</span>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="flex items-center justify-between gap-2">
				<Switch
					class="min-w-0 flex-1"
					checked={locked}
					label={t(messages, 'lock')}
					description={t(messages, 'lockHint')}
					onchange={(checked) => patch({ locked: checked ? true : undefined })}
				/>
			</div>

			<section class="flex flex-col gap-3" aria-label={t(messages, 'position')}>
				<h3 class="text-sm font-bold">{t(messages, 'position')}</h3>
				<div class="grid grid-cols-2 gap-3">
					<NumberField
						value={item.x}
						label="X"
						stepper={false}
						min={-100000}
						max={100000}
						disabled={locked}
						oninput={(mm) =>
							store.transformItem(item.id, { x: mm }, { coalesce: `edit-x-${item.id}` })}
						onchange={seal}
					/>
					<NumberField
						value={item.y}
						label="Y"
						stepper={false}
						min={-100000}
						max={100000}
						disabled={locked}
						oninput={(mm) =>
							store.transformItem(item.id, { y: mm }, { coalesce: `edit-y-${item.id}` })}
						onchange={seal}
					/>
				</div>
				<div class="flex items-end gap-2">
					<TextField
						class="min-w-0 flex-1"
						value={String(Math.round(item.rotation * 10) / 10).replace('.', ',')}
						label={t(messages, 'rotation')}
						inputmode="decimal"
						disabled={locked}
						maxlength={7}
						onchange={(value) => {
							const degrees = parseDegrees(value);
							if (degrees !== undefined) store.transformItem(item.id, { rotation: degrees });
						}}
						data-testid="item-rotation"
					/>
					<IconButton
						icon={RotateCcw}
						label={t(messages, 'rotateLeft')}
						variant="secondary"
						disabled={locked}
						onclick={() => rotateItem(item.id, 90)}
					/>
					<IconButton
						icon={RotateCw}
						label={t(messages, 'rotateRight')}
						variant="secondary"
						disabled={locked}
						onclick={() => rotateItem(item.id, -90)}
					/>
				</div>
				{#if carrier}
					<div class="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
						<span class="min-w-0 flex-1 truncate">
							{t(messages, 'standsOn', { name: itemLabel(carrier) })}
						</span>
						<Button
							size="sm"
							variant="secondary"
							icon={ArrowDownToLine}
							disabled={locked}
							onclick={unstack}
						>
							{t(messages, 'takeDown')}
						</Button>
					</div>
				{:else}
					<NumberField
						value={item.elevation}
						label={t(messages, 'elevation')}
						hint={t(messages, 'elevationHint')}
						min={0}
						max={Math.max(0, room.height - item.dims.h)}
						step={50}
						disabled={locked}
						oninput={(mm) =>
							store.transformItem(item.id, { elevation: mm }, { coalesce: `edit-z-${item.id}` })}
						onchange={seal}
					/>
				{/if}
			</section>

			<section class="flex flex-col gap-3" aria-label={t(messages, 'size')}>
				<h3 class="text-sm font-bold">{t(messages, 'size')}</h3>
				<div class="grid grid-cols-3 gap-2">
					<NumberField
						value={item.dims.w}
						label={t(messages, 'width')}
						min={10}
						max={10000}
						stepper={false}
						disabled={!custom || locked}
						oninput={(mm) => setDim('w', mm)}
						onchange={seal}
					/>
					<NumberField
						value={item.dims.d}
						label={t(messages, 'depth')}
						min={10}
						max={10000}
						stepper={false}
						disabled={!custom || locked}
						oninput={(mm) => setDim('d', mm)}
						onchange={seal}
					/>
					<NumberField
						value={item.dims.h}
						label={t(messages, 'height')}
						min={10}
						max={6000}
						stepper={false}
						disabled={!custom || locked}
						oninput={(mm) => setDim('h', mm)}
						onchange={seal}
					/>
				</div>
				{#if !custom}
					<p class="px-1 text-xs text-muted pointer-coarse:text-sm">{t(messages, 'catalogSize')}</p>
				{/if}
				{#if entry && !entry.verified}
					<p
						class="rounded-md bg-warning-soft px-3 py-2 text-xs text-text pointer-coarse:text-sm"
						data-testid="unverified-note"
					>
						<span class="font-semibold">{t(messages, 'unverified')}.</span>
						{t(messages, 'unverifiedHint')}
					</p>
				{/if}
			</section>

			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-bold">{t(messages, 'color')}</legend>
				<div class="flex flex-wrap items-center gap-2">
					{#each palette as swatch (swatch)}
						<button
							type="button"
							class="size-11 rounded-full border-2 transition duration-(--duration-fast) ease-soft active:scale-90 {item.color ===
							swatch
								? 'border-accent ring-2 ring-accent/40'
								: 'border-border'}"
							style="background: {swatch}"
							aria-label={swatch}
							aria-pressed={item.color === swatch}
							onclick={() => patch({ color: swatch })}
						></button>
					{/each}
					<label
						class="relative inline-flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border"
					>
						<span class="sr-only">{t(messages, 'customColor')}</span>
						<input
							type="color"
							value={item.color ?? '#b8b2a7'}
							class="absolute inset-0 size-full cursor-pointer opacity-0"
							oninput={(event) => patch({ color: event.currentTarget.value }, 'color')}
							onchange={seal}
						/>
						<span class="text-lg text-muted">+</span>
					</label>
				</div>
			</fieldset>

			<section class="flex flex-col gap-3">
				<TextField
					value={item.priceChf === undefined ? '' : String(item.priceChf).replace('.', ',')}
					label={t(messages, 'priceChf')}
					hint={entry && (item.priceChf === undefined || item.priceChf === entry.priceChf)
						? t(messages, 'priceEstimate', { date: pricesAsOf() })
						: undefined}
					inputmode="decimal"
					maxlength={9}
					onchange={(value) => patch({ priceChf: parsePrice(value) })}
					data-testid="item-price"
				/>
				<TextField
					value={item.url ?? ''}
					label={t(messages, 'link')}
					type="url"
					inputmode="url"
					maxlength={300}
					error={linkError ? t(messages, 'linkInvalid') : undefined}
					onchange={saveLink}
					data-testid="item-link"
				/>
				<div class="flex flex-col gap-1.5">
					<label for="item-note" class="px-1 text-sm font-semibold text-muted">
						{t(messages, 'note')}
					</label>
					<textarea
						id="item-note"
						rows="3"
						maxlength={500}
						class="min-h-20 resize-y rounded-md border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
						value={item.note ?? ''}
						onchange={(event) =>
							patch({
								note:
									event.currentTarget.value.trim() === '' ? undefined : event.currentTarget.value
							})}></textarea>
				</div>
			</section>

			<div class="flex gap-2">
				<Button
					class="flex-1"
					variant="secondary"
					icon={Copy}
					onclick={() => duplicateItem(item.id)}
					data-testid="item-duplicate"
				>
					{t(messages, 'duplicate')}
				</Button>
				<Button
					class="flex-1"
					variant="danger"
					icon={Trash2}
					onclick={() => deleteItem(item.id)}
					data-testid="item-delete"
				>
					{t(messages, 'remove')}
				</Button>
			</div>
		</div>
	{/key}
{/if}
