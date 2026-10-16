<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Images from '@lucide/svelte/icons/images';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import X from '@lucide/svelte/icons/x';
	import Camera from '@lucide/svelte/icons/camera';
	import { onMount } from 'svelte';
	import { errorMessage } from '#lib/features/photos/errors.ts';
	import { PhotoError } from '#lib/features/photos/image.ts';
	import MiniPlan from '#lib/features/photos/MiniPlan.svelte';
	import { processFile } from '#lib/features/photos/process.ts';
	import { generateTour } from '#lib/features/photos/tour.ts';
	import { pick, t } from '#lib/i18n/index.svelte.ts';
	import type { CameraSession } from '#lib/mirror/camera.svelte.ts';
	import { MAX_SHOTS_PER_JOB } from '#lib/mirror/types.ts';
	import { roomFromMirror } from '#lib/mirror/room.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';
	import { pickLens, type LensChoice, type ZoomRange } from './lens.ts';
	import { firstOpenPos, nextOpenPos, sequence, takenKeys } from './steps.ts';

	interface Props {
		session: CameraSession;
		roomIndex: number;
		onexit: () => void;
	}

	type CameraState = 'starting' | 'live' | 'denied' | 'missing';

	interface PhotoCapture {
		takePhoto(): Promise<Blob>;
	}
	type PhotoCaptureConstructor = new (track: MediaStreamTrack) => PhotoCapture;
	type ZoomConstraint = MediaTrackConstraintSet & { zoom?: number };

	let { session, roomIndex, onexit }: Props = $props();

	const mirrorRoom = $derived(session.job?.rooms.find((room) => room.index === roomIndex));
	const room = $derived(mirrorRoom ? roomFromMirror(mirrorRoom) : undefined);
	const steps = $derived(room ? generateTour(room) : []);
	const order = $derived(sequence(steps));
	const taken = $derived(
		takenKeys(
			mirrorRoom?.done ?? [],
			session.shots.filter((shot) => shot.room === roomIndex).map((shot) => shot.stepKey)
		)
	);

	let pos = $state(0);
	let positioned = false;
	let busy = $state(false);
	let justSaved = $state(false);
	let camera = $state<CameraState>('starting');
	let lens = $state<'wide' | 'normal'>('normal');
	let lensChoice = $state<LensChoice>(null);
	let video: HTMLVideoElement | undefined = $state();
	let cameraInput: HTMLInputElement | undefined = $state();
	let libraryInput: HTMLInputElement | undefined = $state();
	let stream: MediaStream | undefined;
	let destroyed = false;
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (positioned || !steps.length) return;
		positioned = true;
		pos = firstOpenPos(steps, taken);
	});

	const step = $derived(steps[order[Math.min(pos, order.length - 1)]]);
	const isLast = $derived(pos >= order.length - 1);

	function go(next: number): void {
		justSaved = false;
		if (next >= order.length) {
			onexit();
			return;
		}
		pos = Math.max(0, next);
	}

	function advanceAfter(key: string): void {
		const after = new Set(taken).add(key);
		const next = nextOpenPos(steps, after, pos);
		if (next === null) {
			toasts.show({ message: t(messages, 'roomDone'), kind: 'success' });
			onexit();
			return;
		}
		pos = next;
	}

	async function storeFile(file: File): Promise<boolean> {
		const target = step;
		if (!target) return false;
		try {
			const processed = await processFile(file);
			await session.addShot(roomIndex, target.key, processed);
			justSaved = true;
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (justSaved = false), 900);
			advanceAfter(target.key);
			return true;
		} catch (error) {
			const message =
				error instanceof PhotoError && error.code === 'limit'
					? t(messages, 'jobLimit', { max: MAX_SHOTS_PER_JOB })
					: errorMessage(error, file.name);
			toasts.show({ message, kind: 'error', duration: 8000 });
			return false;
		}
	}

	async function handleFiles(input: HTMLInputElement | undefined): Promise<void> {
		const files = Array.from(input?.files ?? []);
		if (input) input.value = '';
		if (!files.length || busy) return;
		busy = true;
		for (const file of files) {
			if (!(await storeFile(file))) break;
		}
		busy = false;
	}

	function frameToBlob(): Promise<Blob | null> {
		const source = video;
		if (!source || !source.videoWidth) return Promise.resolve(null);
		const canvas = document.createElement('canvas');
		canvas.width = source.videoWidth;
		canvas.height = source.videoHeight;
		canvas.getContext('2d')?.drawImage(source, 0, 0);
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
	}

	async function takeBlob(): Promise<Blob | null> {
		const track = stream?.getVideoTracks()[0];
		const Capture = (globalThis as { ImageCapture?: PhotoCaptureConstructor }).ImageCapture;
		if (track && Capture && track.readyState === 'live') {
			try {
				return await new Capture(track).takePhoto();
			} catch {
				return frameToBlob();
			}
		}
		return frameToBlob();
	}

	async function shoot(): Promise<void> {
		if (busy || camera !== 'live') return;
		busy = true;
		try {
			const blob = await takeBlob();
			if (!blob) {
				toasts.show({ message: t(messages, 'captureFailed'), kind: 'error' });
				return;
			}
			await storeFile(new File([blob], 'roomx.jpg', { type: blob.type || 'image/jpeg' }));
		} finally {
			busy = false;
		}
	}

	function stopStream(): void {
		stream?.getTracks().forEach((track) => track.stop());
		stream = undefined;
		if (video) video.srcObject = null;
	}

	async function startStream(deviceId?: string): Promise<void> {
		stopStream();
		camera = 'starting';
		const media = navigator.mediaDevices;
		if (!media?.getUserMedia) {
			camera = 'missing';
			return;
		}
		const size = { width: { ideal: 4096 }, height: { ideal: 3072 } };
		try {
			const next = await media.getUserMedia({
				video: deviceId
					? { deviceId: { exact: deviceId }, ...size }
					: { facingMode: { ideal: 'environment' }, ...size },
				audio: false
			});
			if (destroyed) {
				next.getTracks().forEach((track) => track.stop());
				return;
			}
			stream = next;
			if (video) {
				video.srcObject = next;
				await video.play().catch(() => undefined);
			}
			if (!lensChoice) {
				const track = next.getVideoTracks()[0];
				const zoom = (track?.getCapabilities?.() as { zoom?: ZoomRange } | undefined)?.zoom;
				const devices = await media.enumerateDevices().catch(() => []);
				lensChoice = pickLens(devices, zoom);
			}
			camera = 'live';
		} catch (error) {
			const name = error instanceof DOMException ? error.name : '';
			camera = name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'denied';
		}
	}

	async function setLens(next: 'wide' | 'normal'): Promise<void> {
		const choice = lensChoice;
		if (!choice || next === lens) return;
		lens = next;
		if (choice.kind === 'device') {
			await startStream(next === 'wide' ? choice.deviceId : undefined);
			return;
		}
		const track = stream?.getVideoTracks()[0];
		const zoom: ZoomConstraint = { zoom: next === 'wide' ? choice.zoom : 1 };
		await track?.applyConstraints({ advanced: [zoom] }).catch(() => undefined);
	}

	onMount(() => {
		void startStream();
		let lock: WakeLockSentinel | undefined;
		async function holdScreen(): Promise<void> {
			try {
				lock = await navigator.wakeLock?.request('screen');
			} catch {
				lock = undefined;
			}
		}
		function onVisibility(): void {
			if (document.visibilityState !== 'visible') return;
			void holdScreen();
			if (stream && !stream.getVideoTracks().some((track) => track.readyState === 'live')) {
				void startStream();
			}
		}
		void holdScreen();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			destroyed = true;
			clearTimeout(savedTimer);
			document.removeEventListener('visibilitychange', onVisibility);
			void lock?.release().catch(() => undefined);
			stopStream();
		};
	});

	const fallback = $derived(camera === 'denied' || camera === 'missing');
</script>

<div
	class="capture fixed inset-0 z-40 flex flex-col overflow-hidden bg-scrim"
	data-testid="camera-capture"
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={video}
		class="absolute inset-0 size-full object-cover {camera === 'live' ? '' : 'invisible'}"
		autoplay
		playsinline
		muted
	></video>

	{#if step && room}
		<div
			class="capture-top relative flex items-start gap-3 px-4 pt-[max(0.75rem,var(--safe-top))] pr-[max(1rem,var(--safe-right))] pl-[max(1rem,var(--safe-left))]"
		>
			<IconButton
				icon={X}
				label={t(messages, 'exit')}
				variant="secondary"
				onclick={onexit}
				data-testid="camera-exit"
			/>
			<div class="min-w-0 grow rounded-lg p-3 text-text surface-glass">
				<p
					class="truncate text-sm font-semibold whitespace-nowrap text-muted"
					data-testid="camera-step"
				>
					<span class="max-[420px]:hidden">
						{t(messages, 'stepOf', { n: pos + 1, total: order.length })}
					</span>
					<span class="min-[421px]:hidden">
						{t(messages, 'stepShort', { n: pos + 1, total: order.length })}
					</span>
					{#if step.optional}· {t(messages, 'optional')}{/if}
				</p>
				<p class="mt-0.5 line-clamp-2 text-lg leading-snug font-bold" data-testid="camera-caption">
					{pick(step.perspective.caption)}
				</p>
			</div>
			<div class="w-28 shrink-0 rounded-lg p-1.5 surface-glass min-[420px]:w-36">
				<MiniPlan {room} {step} />
			</div>
		</div>
	{/if}

	<div class="capture-mid relative flex grow items-center justify-center p-6">
		{#if camera === 'starting'}
			<p class="rounded-lg px-4 py-2 text-text surface-glass" role="status">
				{t(messages, 'cameraStarting')}
			</p>
		{:else if fallback}
			<div class="flex max-w-sm flex-col gap-3 rounded-lg p-4 text-text surface-glass">
				<p class="text-lg font-bold">
					{camera === 'denied' ? t(messages, 'cameraDenied') : t(messages, 'cameraMissing')}
				</p>
				<p class="text-sm text-muted">
					{camera === 'denied' ? t(messages, 'cameraDeniedText') : t(messages, 'cameraMissingText')}
				</p>
				<Button
					variant="primary"
					size="lg"
					full
					icon={Camera}
					disabled={busy}
					loading={busy}
					onclick={() => cameraInput?.click()}
					data-testid="camera-native"
				>
					{t(messages, 'nativeCamera')}
				</Button>
				{#if camera === 'denied'}
					<Button variant="secondary" full onclick={() => void startStream()}>
						{t(messages, 'retryCamera')}
					</Button>
				{/if}
			</div>
		{:else if justSaved}
			<p
				class="flex animate-pop-in items-center gap-2 rounded-full px-4 py-2 font-semibold text-accent surface-glass"
			>
				<Check class="size-5" />
				{t(messages, 'saved')}
			</p>
		{:else if busy}
			<p class="rounded-lg px-4 py-2 text-text surface-glass" role="status">
				{t(messages, 'processing')}
			</p>
		{/if}
	</div>

	<div
		class="capture-bar relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-3 pr-[max(1rem,var(--safe-right))] pb-[max(0.75rem,var(--safe-bottom))] pl-[max(1rem,var(--safe-left))] surface-glass"
	>
		<div class="flex items-center gap-1">
			<IconButton
				icon={ChevronLeft}
				label={t(messages, 'previous')}
				variant="ghost"
				size="lg"
				disabled={busy || pos === 0}
				onclick={() => go(pos - 1)}
				data-testid="camera-back"
			/>
			<IconButton
				icon={Images}
				label={t(messages, 'library')}
				variant="ghost"
				size="lg"
				disabled={busy}
				onclick={() => libraryInput?.click()}
				data-testid="camera-library"
			/>
		</div>
		<button
			type="button"
			class="flex size-20 items-center justify-center rounded-full border-4 border-accent bg-surface shadow-lift transition-transform duration-(--duration-fast) active:scale-95 disabled:opacity-50"
			aria-label={t(messages, 'shutter')}
			disabled={busy || camera !== 'live'}
			onclick={() => void shoot()}
			data-testid="camera-shutter"
		>
			<span class="size-14 rounded-full bg-accent"></span>
		</button>
		<div class="flex items-center justify-end gap-1">
			{#if lensChoice}
				<div
					class="flex rounded-full bg-surface-2 p-0.5"
					role="group"
					aria-label={t(messages, 'lensLabel')}
				>
					{#each ['wide', 'normal'] as const as option (option)}
						<button
							type="button"
							class="min-h-11 min-w-11 rounded-full px-2 text-sm font-bold {lens === option
								? 'bg-accent text-accent-contrast'
								: 'text-muted'}"
							aria-pressed={lens === option}
							onclick={() => void setLens(option)}
							data-testid="camera-lens-{option}"
						>
							{t(messages, option === 'wide' ? 'lensWide' : 'lensNormal')}
						</button>
					{/each}
				</div>
			{/if}
			<IconButton
				icon={SkipForward}
				label={isLast ? t(messages, 'exit') : t(messages, 'skip')}
				variant="ghost"
				size="lg"
				disabled={busy}
				onclick={() => go(pos + 1)}
				data-testid="camera-skip"
			/>
		</div>
	</div>

	<input
		bind:this={cameraInput}
		type="file"
		accept="image/*"
		capture="environment"
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
		onchange={() => void handleFiles(cameraInput)}
		data-testid="camera-file-input"
	/>
	<input
		bind:this={libraryInput}
		type="file"
		accept="image/*"
		multiple
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
		onchange={() => void handleFiles(libraryInput)}
		data-testid="camera-library-input"
	/>
</div>

<style>
	/* Querformat auf dem Handy: Bedienleiste seitlich rechts, die Kamera nutzt die volle Höhe. */
	@media (orientation: landscape) and (max-height: 500px) {
		.capture {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-rows: auto minmax(0, 1fr);
		}
		.capture-top {
			grid-column: 1;
			grid-row: 1;
			padding-right: 1rem;
		}
		.capture-mid {
			grid-column: 1;
			grid-row: 2;
			padding: 0.5rem;
		}
		.capture-bar {
			grid-column: 2;
			grid-row: 1 / span 2;
			grid-template-columns: auto;
			grid-template-rows: 1fr auto 1fr;
			justify-items: center;
			padding: max(0.75rem, var(--safe-top)) max(0.75rem, var(--safe-right))
				max(0.75rem, var(--safe-bottom)) 0.75rem;
		}
	}
</style>
