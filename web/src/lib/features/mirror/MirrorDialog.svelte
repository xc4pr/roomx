<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Copy from '@lucide/svelte/icons/copy';
	import QrIcon from '@lucide/svelte/icons/qr-code';
	import XCircle from '@lucide/svelte/icons/circle-x';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { common } from '#lib/i18n/common.ts';
	import { JobError } from '#lib/mirror/job.ts';
	import { mirrorHost } from '#lib/mirror/host.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { tourProgress } from '#lib/features/photos/tour.ts';
	import { messages } from './i18n.ts';
	import QrCode from './QrCode.svelte';
	import { formatExpiry, statusText } from './status.ts';

	interface Props {
		open?: boolean;
		roomIds?: string[];
		jobId?: string;
		onclose?: () => void;
	}

	let { open = $bindable(false), roomIds = [], jobId, onclose }: Props = $props();

	let selected = $state<string[]>([]);
	let createdId = $state<string | undefined>();
	let busy = $state(false);
	let error = $state('');
	let qrIndex = $state(0);
	let confirmOpen = $state(false);

	const activeId = $derived(jobId ?? createdId);
	const job = $derived(
		activeId ? mirrorHost.jobs.find((entry) => entry.id === activeId) : undefined
	);
	const rooms = $derived(store.project?.rooms ?? []);
	const status = $derived(job ? mirrorHost.status(job.id) : undefined);
	const jobRoomNames = $derived(
		job ? job.rooms.map((entry) => store.room(entry.roomId)?.name).filter((name) => !!name) : []
	);
	const linkIndex = $derived(job ? Math.min(qrIndex, Math.max(0, job.links.length - 1)) : 0);
	const link = $derived(job?.links[linkIndex]);

	$effect(() => {
		if (open) {
			selected = roomIds.filter((id) => rooms.some((room) => room.id === id));
			createdId = undefined;
			error = '';
			qrIndex = 0;
		}
	});

	$effect(() => {
		if (open && activeId && !job) open = false;
	});

	function toggle(id: string): void {
		selected = selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
	}

	function errorText(cause: unknown): string {
		if (cause instanceof JobError) {
			if (cause.code === 'noRooms') return t(messages, 'errorNoRooms');
			if (cause.code === 'tooManyRooms') return t(messages, 'errorTooManyRooms');
			return t(messages, 'errorRoomTooLarge');
		}
		return t(messages, 'errorGeneric');
	}

	async function create(): Promise<void> {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const ordered = rooms.map((room) => room.id).filter((id) => selected.includes(id));
			const created = await mirrorHost.create(ordered);
			createdId = created.id;
			qrIndex = 0;
		} catch (cause) {
			error = errorText(cause);
		} finally {
			busy = false;
		}
	}

	async function copy(): Promise<void> {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			toasts.show({ message: t(messages, 'linkCopied'), kind: 'success' });
		} catch {
			toasts.show({ message: t(messages, 'copyFailed'), kind: 'error' });
		}
	}

	async function revoke(): Promise<void> {
		if (!job) return;
		try {
			await mirrorHost.revoke(job.id);
			toasts.show({ message: t(messages, 'revoked'), kind: 'success' });
			open = false;
		} catch {
			toasts.show({ message: t(messages, 'revokeFailed'), kind: 'error' });
		}
	}
</script>

<Dialog
	bind:open
	title={t(messages, 'dialogTitle')}
	description={job ? undefined : t(messages, 'pickIntro')}
	closeLabel={t(common, 'close')}
	size="md"
	{onclose}
>
	{#if job}
		<div class="flex flex-col items-center gap-4">
			{#if link}
				<QrCode text={link} label={t(messages, 'qrLabel')} />
			{/if}
			{#if job.links.length > 1}
				<div class="flex items-center gap-3">
					<IconButton
						icon={ChevronLeft}
						label={t(messages, 'qrPrevious')}
						disabled={linkIndex === 0}
						onclick={() => (qrIndex = linkIndex - 1)}
						data-testid="mirror-qr-prev"
					/>
					<span class="text-sm font-semibold tabular-nums" data-testid="mirror-qr-part">
						{t(messages, 'qrPart', { n: linkIndex + 1, total: job.links.length })}
					</span>
					<IconButton
						icon={ChevronRight}
						label={t(messages, 'qrNext')}
						disabled={linkIndex >= job.links.length - 1}
						onclick={() => (qrIndex = linkIndex + 1)}
						data-testid="mirror-qr-next"
					/>
				</div>
				<p class="text-center text-sm text-muted">
					{t(messages, 'qrMore', { total: job.links.length })}
				</p>
			{/if}

			<div class="flex w-full items-center gap-2">
				<input
					readonly
					value={link ?? ''}
					aria-label={t(messages, 'link')}
					class="min-h-11 min-w-0 grow truncate rounded-md border border-border bg-surface-2 px-3 text-sm text-muted"
					data-testid="mirror-link"
				/>
				<Button icon={Copy} onclick={copy} data-testid="mirror-link-copy">
					{t(messages, 'copyLink')}
				</Button>
			</div>

			<div class="flex w-full flex-col gap-1 text-sm">
				<p class="font-semibold" role="status" data-testid="mirror-status">
					{status ? statusText(status) : ''}
				</p>
				<p class="text-muted">{t(messages, 'expires', { date: formatExpiry(job.expiresAt) })}</p>
				{#if jobRoomNames.length}
					<p class="text-muted">{t(messages, 'rooms', { names: jobRoomNames.join(', ') })}</p>
				{/if}
			</div>

			<div class="w-full rounded-md bg-surface-2 p-3 text-sm">
				<h4 class="mb-1 font-semibold">{t(messages, 'howTitle')}</h4>
				<ol class="list-decimal space-y-1 pl-5 text-muted">
					<li>{t(messages, 'how1')}</li>
					<li>{t(messages, 'how2')}</li>
					<li>{t(messages, 'how3')}</li>
					<li>{t(messages, 'how4')}</li>
				</ol>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<h4 class="text-sm font-semibold text-muted">{t(messages, 'pickRooms')}</h4>
			{#if rooms.length === 0}
				<p class="rounded-md bg-surface-2 p-3 text-sm text-muted">{t(messages, 'noRooms')}</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each rooms as room (room.id)}
						{@const progress = tourProgress(room)}
						{@const checked = selected.includes(room.id)}
						<li>
							<label
								class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 has-checked:border-accent has-checked:bg-accent-soft"
							>
								<input
									type="checkbox"
									class="size-5 shrink-0 accent-accent"
									{checked}
									onchange={() => toggle(room.id)}
									data-testid="mirror-room-{room.id}"
								/>
								<span class="min-w-0 grow">
									<span class="block truncate font-medium">{room.name}</span>
									<span class="block text-xs text-muted">
										{t(messages, 'roomProgress', progress)}
									</span>
								</span>
							</label>
						</li>
					{/each}
				</ul>
			{/if}
			{#if error}
				<p
					class="rounded-md bg-danger-soft p-3 text-sm text-danger"
					role="alert"
					data-testid="mirror-error"
				>
					{error}
				</p>
			{/if}
			{#if store.readOnly}
				<p class="rounded-md bg-surface-2 p-3 text-sm text-muted">{t(messages, 'errorReadOnly')}</p>
			{/if}
		</div>
	{/if}

	{#snippet actions()}
		{#if job}
			<Button
				variant="ghost"
				class="mr-auto text-danger! hover:bg-danger-soft!"
				icon={XCircle}
				onclick={() => (confirmOpen = true)}
				data-testid="mirror-revoke"
			>
				{t(messages, 'revoke')}
			</Button>
			<Button variant="primary" onclick={() => (open = false)} data-testid="mirror-done">
				{t(messages, 'done')}
			</Button>
		{:else}
			<Button variant="ghost" onclick={() => (open = false)}>{t(common, 'cancel')}</Button>
			<Button
				variant="primary"
				icon={QrIcon}
				loading={busy}
				disabled={selected.length === 0 || store.readOnly}
				onclick={create}
				data-testid="mirror-create"
			>
				{t(messages, 'create')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

<ConfirmDialog
	bind:open={confirmOpen}
	title={t(messages, 'revokeTitle')}
	message={t(messages, 'revokeMessage')}
	confirmLabel={t(messages, 'revoke')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	danger
	onconfirm={revoke}
/>
