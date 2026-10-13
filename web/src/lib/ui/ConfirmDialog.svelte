<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';

	interface Props {
		open?: boolean;
		title: string;
		message?: string;
		confirmLabel: string;
		cancelLabel: string;
		closeLabel?: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		message,
		confirmLabel,
		cancelLabel,
		closeLabel,
		danger = false,
		onconfirm,
		oncancel
	}: Props = $props();
</script>

<Dialog bind:open {title} description={message} {closeLabel} size="sm" onclose={oncancel}>
	{#snippet actions()}
		<Button
			variant="ghost"
			onclick={() => {
				open = false;
				oncancel?.();
			}}>{cancelLabel}</Button
		>
		<Button
			variant={danger ? 'danger' : 'primary'}
			data-testid="confirm"
			onclick={() => {
				open = false;
				onconfirm();
			}}>{confirmLabel}</Button
		>
	{/snippet}
</Dialog>
