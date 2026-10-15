<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Check from '@lucide/svelte/icons/check';
	import Send from '@lucide/svelte/icons/send';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { requestPersistence } from '#lib/features/settings/storage.ts';
	import { generateTour } from '#lib/features/photos/tour.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { CameraSession } from '#lib/mirror/camera.svelte.ts';
	import { deleteCameraJob, getJob } from '#lib/mirror/jobs.ts';
	import { roomFromMirror } from '#lib/mirror/room.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import CaptureView from './CaptureView.svelte';
	import { messages } from './i18n.ts';
	import { hoursLeft, jobPhase, needsSafariNote, statusKind } from './phase.ts';
	import { buildShareFiles, shareFiles } from './share.ts';
	import { firstOpenPos, isRoomComplete, roomProgress, takenKeys } from './steps.ts';

	interface Props {
		jobId: string;
	}

	let { jobId }: Props = $props();

	const session = $derived(new CameraSession(jobId));
	const job = $derived(session.job);
	const status = $derived(session.status);

	let lookup = $state<'loading' | 'found' | 'missing'>('loading');
	let phase = $state<'ask' | 'later' | 'main'>('main');
	let capturing = $state<number | null>(null);
	let now = $state(Date.now());
	let files = $state<File[]>([]);
	let filesReady = $state(false);
	let confirmingDelete = $state(false);
	let sharing = $state(false);
	let safariNote = $state(false);

	const seenKey = (id: string): string => `roomx.camera.seen.${id}`;

	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		safariNote = needsSafariNote({
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			maxTouchPoints: navigator.maxTouchPoints,
			standalone:
				(navigator as Navigator & { standalone?: boolean }).standalone === true ||
				matchMedia('(display-mode: standalone)').matches
		});
		void requestPersistence();
		return () => clearInterval(timer);
	});

	$effect(() => {
		const stop = session.start();
		return stop;
	});

	$effect(() => {
		const id = jobId;
		let cancelled = false;
		lookup = 'loading';
		void getJob(id).then(
			(found) => {
				if (cancelled) return;
				lookup = found?.role === 'camera' ? 'found' : 'missing';
				if (lookup !== 'found') return;
				let seen = true;
				try {
					seen = localStorage.getItem(seenKey(id)) !== null;
				} catch {
					seen = true;
				}
				phase = seen ? 'main' : 'ask';
			},
			() => {
				if (!cancelled) lookup = 'missing';
			}
		);
		return () => {
			cancelled = true;
		};
	});

	function markSeen(): void {
		try {
			localStorage.setItem(seenKey(jobId), String(Date.now()));
		} catch {
			void 0;
		}
	}

	const rooms = $derived(
		(job?.rooms ?? []).map((mirror) => {
			const steps = generateTour(roomFromMirror(mirror));
			const keys = session.shots.filter((shot) => shot.room === mirror.index).map((s) => s.stepKey);
			return {
				mirror,
				steps,
				progress: roomProgress(steps, mirror.done, keys),
				open: firstOpenPos(steps, takenKeys(mirror.done, keys))
			};
		})
	);

	const jobState = $derived(
		job
			? jobPhase(
					{
						expiresAt: job.expiresAt,
						revoked: status.revoked || !!job.revokedAt,
						expired: status.expired
					},
					now
				)
			: 'open'
	);
	const unsent = $derived(session.shots.length);
	const kind = $derived(
		statusKind({
			status: status.status,
			sent: status.sent,
			total: status.total,
			revoked: status.revoked || !!job?.revokedAt,
			expired: status.expired
		})
	);
	const statusText = $derived.by(() => {
		switch (kind) {
			case 'searching':
				return t(messages, 'statusSearching');
			case 'connected':
				return t(messages, 'statusConnected');
			case 'progress':
				return t(messages, 'statusProgress', { sent: status.sent, total: status.total });
			case 'allSent':
				return t(messages, 'statusAllSent');
			case 'ended':
				return t(messages, 'statusEnded');
			default:
				return t(messages, 'statusOffline');
		}
	});
	const showFallback = $derived(status.fallbackSuggested && unsent > 0 && jobState !== 'ended');
	const canShare = $derived(unsent > 0 && (showFallback || jobState !== 'open'));

	$effect(() => {
		const shots = session.shots;
		let cancelled = false;
		filesReady = false;
		if (!shots.length || !canShare) {
			files = [];
			return;
		}
		void buildShareFiles(shots).then(
			(built) => {
				if (cancelled) return;
				files = built;
				filesReady = true;
			},
			() => {
				if (!cancelled) files = [];
			}
		);
		return () => {
			cancelled = true;
		};
	});

	async function send(): Promise<void> {
		if (!filesReady || sharing) return;
		sharing = true;
		const outcome = await shareFiles(files, job?.project ?? 'RoomX');
		sharing = false;
		if (outcome === 'shared') toasts.show({ message: t(messages, 'shared'), kind: 'success' });
		else if (outcome === 'downloaded')
			toasts.show({ message: t(messages, 'downloaded'), kind: 'info' });
		else if (outcome === 'failed')
			toasts.show({ message: t(messages, 'shareFailed'), kind: 'error' });
	}

	async function remove(): Promise<void> {
		try {
			await deleteCameraJob(jobId);
			toasts.show({ message: t(messages, 'deleted'), kind: 'success' });
			await goto(resolve('/'));
		} catch {
			toasts.show({ message: t(messages, 'deleteFailed'), kind: 'error' });
		}
	}

	function startNow(): void {
		markSeen();
		phase = 'main';
		const target = rooms.find((room) => !isRoomComplete(room.progress)) ?? rooms[0];
		if (target && jobState !== 'ended') capturing = target.mirror.index;
	}

	function startLater(): void {
		markSeen();
		phase = 'later';
	}
</script>

{#if lookup === 'missing'}
	<div
		class="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
		data-testid="camera-missing"
	>
		<div>
			<p class="text-xl font-bold">{t(messages, 'missingTitle')}</p>
			<p class="mt-1.5 text-muted">{t(messages, 'missingText')}</p>
		</div>
		<Button variant="primary" href={resolve('/')}>{t(messages, 'toProjects')}</Button>
	</div>
{:else if !job}
	<div class="flex h-full items-center justify-center p-6 text-muted" role="status">
		{t(messages, 'loading')}
	</div>
{:else}
	<div class="h-full overflow-y-auto overscroll-contain" data-testid="camera-mode">
		<div
			class="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 px-5 pt-[max(1rem,var(--safe-top))] pr-[max(1.25rem,var(--safe-right))] pb-[max(2rem,var(--safe-bottom))] pl-[max(1.25rem,var(--safe-left))]"
		>
			<header class="flex flex-col gap-2 pt-2">
				<h1 class="text-2xl font-extrabold tracking-tight">
					{t(messages, 'title', { project: job.project })}
				</h1>
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold {kind ===
						'allSent'
							? 'bg-accent-soft text-accent'
							: kind === 'offline' || kind === 'ended'
								? 'bg-warning-soft'
								: 'bg-surface-2'}"
						role="status"
						data-testid="camera-status"
					>
						{statusText}
					</span>
					{#if status.server === 'unreachable'}
						<span
							class="inline-flex min-h-8 items-center rounded-full bg-warning-soft px-3 text-sm font-semibold"
							data-testid="camera-server"
						>
							{t(messages, 'serverUnreachable')}
						</span>
					{:else if status.server === 'ok' && status.uploaded > 0}
						<span
							class="inline-flex min-h-8 items-center rounded-full bg-surface-2 px-3 text-sm font-semibold"
							data-testid="camera-server"
						>
							{t(messages, 'serverUploaded', { n: status.uploaded })}
						</span>
					{/if}
					{#if jobState !== 'ended'}
						<span class="text-sm text-muted">
							{t(messages, 'expiresIn', { hours: hoursLeft(job.expiresAt, now) })}
						</span>
					{/if}
				</div>
			</header>

			{#if phase === 'ask'}
				<section class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
					<p class="text-lg font-bold">{t(messages, 'askTitle')}</p>
					<p class="text-muted">{t(messages, 'askText', { rooms: job.rooms.length })}</p>
					<Button
						variant="primary"
						size="lg"
						full
						icon={Camera}
						onclick={startNow}
						data-testid="camera-now"
					>
						{t(messages, 'askNow')}
					</Button>
					<Button variant="secondary" full onclick={startLater} data-testid="camera-later">
						{t(messages, 'askLater')}
					</Button>
				</section>
			{:else}
				{#if phase === 'later'}
					<section
						class="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-soft p-4"
						data-testid="camera-later-note"
					>
						<p class="flex items-center gap-2 font-bold">
							<Smartphone class="size-5 shrink-0 text-accent" />
							{t(messages, 'laterTitle')}
						</p>
						<p class="text-sm">{t(messages, 'laterText')}</p>
						<Button variant="secondary" onclick={() => (phase = 'main')}>
							{t(messages, 'laterContinue')}
						</Button>
					</section>
				{/if}

				{#if jobState === 'ended'}
					<section
						class="flex flex-col gap-3 rounded-lg border border-border bg-warning-soft p-4"
						data-testid="camera-ended"
					>
						<p class="flex items-center gap-2 font-bold">
							<TriangleAlert class="size-5 shrink-0" />
							{t(messages, 'endedTitle')}
						</p>
						<p class="text-sm">
							{unsent > 0 ? t(messages, 'endedText', { n: unsent }) : t(messages, 'endedNone')}
						</p>
					</section>
				{:else if jobState === 'soon' && unsent > 0}
					<section
						class="flex flex-col gap-3 rounded-lg border border-border bg-warning-soft p-4"
						data-testid="camera-soon"
					>
						<p class="flex items-center gap-2 font-bold">
							<TriangleAlert class="size-5 shrink-0" />
							{t(messages, 'soonTitle')}
						</p>
						<p class="text-sm">
							{t(messages, 'soonText', { hours: hoursLeft(job.expiresAt, now), n: unsent })}
						</p>
					</section>
				{:else if showFallback}
					<section
						class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
						data-testid="camera-fallback"
					>
						<p class="font-bold">{t(messages, 'fallbackTitle')}</p>
						<p class="text-sm text-muted">{t(messages, 'fallbackText')}</p>
					</section>
				{/if}

				{#if canShare || jobState === 'ended'}
					<div class="flex flex-wrap gap-2">
						{#if canShare}
							<Button
								variant="primary"
								icon={Send}
								loading={sharing || !filesReady}
								disabled={!filesReady}
								onclick={() => void send()}
								data-testid="camera-share"
							>
								{jobState === 'ended'
									? t(messages, 'sendCount', { n: unsent })
									: t(messages, 'sendInstead')}
							</Button>
						{/if}
						{#if jobState === 'ended'}
							<Button
								variant="danger"
								icon={Trash2}
								onclick={() => (confirmingDelete = true)}
								data-testid="camera-delete"
							>
								{t(messages, 'delete')}
							</Button>
						{/if}
					</div>
				{/if}

				{#if safariNote}
					<aside
						class="rounded-lg border border-border bg-surface p-4 text-sm"
						data-testid="camera-ios-note"
					>
						<p class="font-bold">{t(messages, 'iosTitle')}</p>
						<p class="mt-1 text-muted">{t(messages, 'iosText')}</p>
					</aside>
				{/if}

				<section class="flex flex-col gap-3" aria-label={t(messages, 'rooms')}>
					{#each rooms as room (room.mirror.index)}
						<div
							class="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
							data-testid="camera-room-{room.mirror.index}"
						>
							<div class="min-w-0 grow">
								<p class="truncate text-lg font-bold">{room.mirror.name}</p>
								<p class="text-sm text-muted">
									{isRoomComplete(room.progress) && room.progress.onPhone === 0
										? t(messages, 'roomComplete')
										: t(messages, 'roomProgress', {
												done: room.progress.done + room.progress.onPhone,
												total: room.progress.total
											})}
								</p>
								{#if room.progress.onPhone > 0}
									<p class="text-sm text-muted">
										{t(messages, 'roomOnPhone', { n: room.progress.onPhone })}
									</p>
								{/if}
							</div>
							{#if isRoomComplete(room.progress)}
								<Check class="size-6 shrink-0 text-accent" />
							{/if}
							<Button
								variant={isRoomComplete(room.progress) ? 'secondary' : 'primary'}
								icon={Camera}
								disabled={jobState === 'ended'}
								onclick={() => (capturing = room.mirror.index)}
								data-testid="camera-room-{room.mirror.index}-go"
							>
								{t(messages, 'photograph')}
							</Button>
						</div>
					{/each}
				</section>
			{/if}
		</div>
	</div>

	{#if capturing !== null}
		<CaptureView {session} roomIndex={capturing} onexit={() => (capturing = null)} />
	{/if}

	<ConfirmDialog
		bind:open={confirmingDelete}
		title={t(messages, 'deleteTitle')}
		message={t(messages, 'deleteMessage', { n: unsent })}
		confirmLabel={t(messages, 'deleteConfirm')}
		cancelLabel={t(messages, 'cancel')}
		closeLabel={t(messages, 'close')}
		danger
		onconfirm={() => void remove()}
	/>
{/if}
