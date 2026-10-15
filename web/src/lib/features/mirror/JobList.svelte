<script lang="ts">
	import FileImage from '@lucide/svelte/icons/file-image';
	import QrIcon from '@lucide/svelte/icons/qr-code';
	import XCircle from '@lucide/svelte/icons/circle-x';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { common } from '#lib/i18n/common.ts';
	import { mirrorHost } from '#lib/mirror/host.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';
	import ImportShots from './ImportShots.svelte';
	import MirrorDialog from './MirrorDialog.svelte';
	import { formatExpiry, statusText } from './status.ts';

	let { roomId, class: className = '' }: { roomId?: string; class?: string } = $props();

	let showId = $state<string | undefined>();
	let showOpen = $state(false);
	let importOpen = $state(false);
	let revokeId = $state<string | undefined>();
	let revokeOpen = $state(false);

	const jobs = $derived(
		mirrorHost.jobs.filter(
			(job) =>
				job.revokedAt === undefined &&
				(!roomId || job.rooms.some((entry) => entry.roomId === roomId))
		)
	);

	function names(job: (typeof jobs)[number]): string {
		return job.rooms
			.map((entry) => store.room(entry.roomId)?.name)
			.filter((name) => !!name)
			.join(', ');
	}

	async function revoke(): Promise<void> {
		const id = revokeId;
		if (!id) return;
		try {
			await mirrorHost.revoke(id);
			toasts.show({ message: t(messages, 'revoked'), kind: 'success' });
		} catch {
			toasts.show({ message: t(messages, 'revokeFailed'), kind: 'error' });
		}
	}
</script>

{#if jobs.length}
	<section class="flex flex-col gap-2.5 {className}" data-testid="mirror-jobs">
		<h4 class="text-sm font-semibold text-muted">{t(messages, 'jobsTitle')}</h4>
		<ul class="flex flex-col gap-2.5">
			{#each jobs as job (job.id)}
				<li
					class="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
					data-testid="mirror-job"
				>
					<div class="flex flex-col gap-0.5 text-sm">
						<span class="font-semibold">{names(job)}</span>
						<span class="text-muted" data-testid="mirror-status">
							{statusText(mirrorHost.status(job.id))}
						</span>
						<span class="text-muted">
							{t(messages, 'expires', { date: formatExpiry(job.expiresAt) })}
						</span>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button
							size="sm"
							icon={QrIcon}
							onclick={() => {
								showId = job.id;
								showOpen = true;
							}}
							data-testid="mirror-show"
						>
							{t(messages, 'showQr')}
						</Button>
						<Button
							size="sm"
							icon={FileImage}
							onclick={() => (importOpen = true)}
							data-testid="mirror-import"
						>
							{t(messages, 'importFiles')}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							icon={XCircle}
							onclick={() => {
								revokeId = job.id;
								revokeOpen = true;
							}}
							data-testid="mirror-revoke"
						>
							{t(messages, 'revoke')}
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<MirrorDialog bind:open={showOpen} jobId={showId} />
<ImportShots bind:open={importOpen} />
<ConfirmDialog
	bind:open={revokeOpen}
	title={t(messages, 'revokeTitle')}
	message={t(messages, 'revokeMessage')}
	confirmLabel={t(messages, 'revoke')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	danger
	onconfirm={revoke}
/>
