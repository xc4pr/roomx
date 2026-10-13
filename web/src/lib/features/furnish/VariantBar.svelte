<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Copy from '@lucide/svelte/icons/copy';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Menu, { type MenuItem } from '#lib/ui/Menu.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { nextVariantName } from './budget.ts';
	import { messages } from './i18n.ts';

	let { class: extra = '' }: { class?: string } = $props();

	let menu = $state<{ kind: 'add' | 'more'; x: number; y: number } | null>(null);
	let menuOpen = $state(false);
	let renameOpen = $state(false);
	let renameValue = $state('');
	let confirmOpen = $state(false);

	const variants = $derived(store.project?.variants ?? []);
	const active = $derived(store.activeVariant);
	const items = $derived(
		variants.length > 0
			? variants.map((variant) => ({ value: variant.id, label: variant.name || '?' }))
			: [{ value: '', label: 'A' }]
	);

	function openMenu(kind: 'add' | 'more', event: MouseEvent): void {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		menu = { kind, x: rect.left, y: rect.bottom + 4 };
		menuOpen = true;
	}

	function create(copy: boolean): void {
		ui.selectedItemId = null;
		store.addVariant(nextVariantName(variants), copy ? active?.id : undefined);
	}

	function startRename(): void {
		renameValue = active?.name ?? '';
		renameOpen = true;
	}

	function saveRename(): void {
		const name = renameValue.trim();
		if (active && name) store.renameVariant(active.id, name);
		store.sealHistory();
		renameOpen = false;
	}

	const menuItems = $derived.by((): MenuItem[] => {
		if (menu?.kind === 'add') {
			return [
				{ label: t(messages, 'variantNew'), icon: SquarePlus, onselect: () => create(false) },
				{
					label: t(messages, 'variantCopy', { name: active?.name ?? 'A' }),
					icon: Copy,
					disabled: !active,
					onselect: () => create(true)
				}
			];
		}
		return [
			{
				label: t(messages, 'variantRename'),
				icon: Pencil,
				disabled: !active,
				onselect: startRename
			},
			{
				label: t(messages, 'variantDelete'),
				icon: Trash2,
				danger: true,
				disabled: !active || variants.length < 2,
				separatorBefore: true,
				onselect: () => (confirmOpen = true)
			}
		];
	});
</script>

<div class="flex min-w-0 items-center gap-1 {extra}" data-testid="variant-bar">
	<div class="no-scrollbar min-w-0 overflow-x-auto">
		<SegmentedControl
			{items}
			value={active?.id ?? ''}
			label={t(messages, 'variants')}
			onchange={(id) => {
				if (id && id !== active?.id) {
					ui.selectedItemId = null;
					store.setActiveVariant(id);
				}
			}}
		/>
	</div>
	<IconButton
		icon={Plus}
		label={t(messages, 'variantAdd')}
		variant="secondary"
		onclick={(event) => openMenu('add', event)}
		data-testid="variant-add"
	/>
	<IconButton
		icon={Ellipsis}
		label={t(messages, 'variantMore')}
		variant="ghost"
		onclick={(event) => openMenu('more', event)}
		data-testid="variant-more"
	/>
</div>

<Menu
	bind:open={menuOpen}
	x={menu?.x ?? 0}
	y={menu?.y ?? 0}
	items={menuItems}
	label={t(messages, 'variants')}
/>

<Dialog
	bind:open={renameOpen}
	title={t(messages, 'variantRename')}
	size="sm"
	closeLabel={t(common, 'close')}
>
	<TextField
		bind:value={renameValue}
		label={t(messages, 'name')}
		maxlength={30}
		autofocus
		onenter={saveRename}
	/>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (renameOpen = false)}>{t(common, 'cancel')}</Button>
		<Button variant="primary" onclick={saveRename}>{t(messages, 'save')}</Button>
	{/snippet}
</Dialog>

<ConfirmDialog
	bind:open={confirmOpen}
	danger
	title={t(messages, 'variantDeleteTitle', { name: active?.name ?? '' })}
	message={t(messages, 'variantDeleteText')}
	confirmLabel={t(common, 'delete')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	onconfirm={() => {
		if (active) {
			ui.selectedItemId = null;
			store.removeVariant(active.id);
		}
	}}
/>
