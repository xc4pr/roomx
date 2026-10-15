<script lang="ts">
	import { LIMITS } from '#lib/security/limits.ts';
	import { untrack } from 'svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { common } from '#lib/i18n/common.ts';
	import { pick, t } from '#lib/i18n/index.svelte.ts';
	import { getPhoto } from '#lib/state/persistence.ts';
	import { ensurePhoto } from '#lib/state/sync.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';

	interface Props {
		roomId: string;
		photoId: string;
		onclose: () => void;
	}

	let { roomId, photoId, onclose }: Props = $props();

	const photo = $derived(store.room(roomId)?.photos.find((candidate) => candidate.id === photoId));
	let note = $state(
		untrack(() => store.room(roomId)?.photos.find((p) => p.id === photoId)?.note ?? '')
	);
	let url = $state<string | null>(null);
	let absent = $state(false);
	let loading = $state(false);
	let confirming = $state(false);

	$effect(() => {
		const hash = photo?.hash;
		if (!hash) return;
		let created: string | null = null;
		let cancelled = false;
		absent = false;
		const show = (blob: Blob): void => {
			created = URL.createObjectURL(blob);
			url = created;
		};
		void getPhoto(hash).then(async (stored) => {
			if (cancelled) return;
			if (stored) return show(stored.blob);
			loading = true;
			const arrived = await ensurePhoto(hash).catch(() => false);
			if (cancelled) return;
			loading = false;
			const fetched = arrived ? await getPhoto(hash) : undefined;
			if (cancelled) return;
			if (fetched) show(fetched.blob);
			else absent = true;
		});
		return () => {
			cancelled = true;
			loading = false;
			if (created) URL.revokeObjectURL(created);
			url = null;
		};
	});

	function saveNote(value: string): void {
		if (!photo) return;
		const text = value.trim();
		if (text === (photo.note ?? '')) return;
		if (photo.perspective.kind === 'free') {
			store.updatePhoto(roomId, photo.id, {
				note: text || undefined,
				perspective: {
					...photo.perspective,
					caption: {
						de: text || messages.de.freeCaption,
						en: text || messages.en.freeCaption
					}
				}
			});
		} else {
			store.updatePhoto(roomId, photo.id, { note: text || undefined });
		}
	}

	function remove(): void {
		const removed = store.removePhoto(roomId, photoId);
		toasts.show({
			message: t(messages, 'deleted'),
			kind: 'success',
			actionLabel: removed ? t(messages, 'undoDelete') : undefined,
			onaction: removed
				? () => {
						if (store.restorePhoto(roomId, removed.photo, removed.index)) {
							toasts.show({ message: t(messages, 'restoredPhoto'), kind: 'success' });
						}
					}
				: undefined,
			duration: 10_000
		});
		onclose();
	}
</script>

{#if photo}
	<Dialog
		open
		title={pick(photo.perspective.caption)}
		closeLabel={t(messages, 'viewerClose')}
		size="lg"
		{onclose}
	>
		<div class="flex flex-col gap-4">
			{#if url}
				<img
					src={url}
					alt={pick(photo.perspective.caption)}
					class="mx-auto max-h-[44dvh] max-w-full rounded-lg object-contain"
					data-testid="photo-full"
				/>
			{:else if loading}
				<div
					class="flex items-center justify-center gap-3 rounded-lg bg-surface-2 px-4 py-10 text-muted"
				>
					<ProgressRing size={22} stroke={3} />
					{t(messages, 'imageLoading')}
				</div>
			{:else if absent}
				<p class="rounded-lg bg-surface-2 px-4 py-10 text-center text-muted">
					{t(messages, 'imageMissing')}
				</p>
			{/if}
			<TextField
				bind:value={note}
				label={t(messages, 'note')}
				maxlength={LIMITS.text}
				placeholder={t(messages, 'notePlaceholder')}
				onchange={saveNote}
				onenter={saveNote}
				data-testid="photo-note"
			/>
		</div>
		{#snippet actions()}
			<Button variant="danger" icon={Trash2} onclick={() => (confirming = true)}>
				{t(common, 'delete')}
			</Button>
		{/snippet}
	</Dialog>
	<ConfirmDialog
		bind:open={confirming}
		title={t(messages, 'deleteTitle')}
		message={t(messages, 'deleteMessage')}
		confirmLabel={t(common, 'delete')}
		cancelLabel={t(common, 'cancel')}
		closeLabel={t(common, 'close')}
		danger
		onconfirm={remove}
	/>
{/if}
