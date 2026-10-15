<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Images from '@lucide/svelte/icons/images';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import X from '@lucide/svelte/icons/x';
	import { pick, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';
	import MiniPlan from './MiniPlan.svelte';
	import { errorMessage } from './errors.ts';
	import { addPhotoFromFile } from './process.ts';
	import type { ThumbCache } from './thumbs.svelte.ts';
	import { generateTour, tourProgress, type TourStep } from './tour.ts';

	interface Props {
		roomId: string;
		startKey?: string;
		thumbs: ThumbCache;
		onexit: () => void;
	}

	let { roomId, startKey, thumbs, onexit }: Props = $props();

	const ADVANCE_DELAY = 1300;

	const room = $derived(store.room(roomId));
	const steps = $derived(room ? generateTour(room) : []);

	function firstOpen(): number {
		const current = store.room(roomId);
		if (!current) return 0;
		const list = generateTour(current);
		const taken = new Set(current.photos.map((photo) => photo.perspective.stepKey));
		const byKey = startKey ? list.findIndex((step) => step.key === startKey) : -1;
		if (byKey >= 0) return byKey;
		const required = list.findIndex((step) => !step.optional && !taken.has(step.key));
		if (required >= 0) return required;
		const optional = list.findIndex((step) => !taken.has(step.key));
		return optional >= 0 ? optional : 0;
	}

	let index = $state(firstOpen());
	let busy = $state(false);
	let progress = $state<{ n: number; total: number } | null>(null);
	let justSaved = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let cameraInput: HTMLInputElement | undefined = $state();
	let libraryInput: HTMLInputElement | undefined = $state();

	const step = $derived<TourStep | undefined>(steps[Math.min(index, steps.length - 1)]);
	const stepPhotos = $derived(
		step && room ? room.photos.filter((photo) => photo.perspective.stepKey === step.key) : []
	);
	const isLast = $derived(index >= steps.length - 1);

	const hint = $derived.by(() => {
		if (!step) return '';
		const { kind, stepKey } = step.perspective;
		if (kind === 'corner') {
			return (stepKey ?? '').split(':').length > 2 ? 'hintReflex' : 'hintCorner';
		}
		if (kind === 'wall') return 'hintWall';
		if (kind === 'ceiling') return 'hintCeiling';
		if (kind === 'floor') return 'hintFloor';
		return stepKey?.startsWith('electric:') ? 'hintElectric' : 'hintElement';
	});
	const wideAngle = $derived(hint === 'hintCorner');

	$effect(() => {
		return () => clearTimeout(timer);
	});

	function go(next: number): void {
		clearTimeout(timer);
		justSaved = false;
		if (next >= steps.length) {
			finish();
			return;
		}
		index = Math.max(0, next);
	}

	function finish(): void {
		clearTimeout(timer);
		const current = store.room(roomId);
		if (current) {
			const { done, total } = tourProgress(current);
			if (total > 0 && done === total) {
				toasts.show({ message: t(messages, 'tourDone'), kind: 'success' });
			}
		}
		onexit();
	}

	async function handleFiles(input: HTMLInputElement | undefined): Promise<void> {
		const files = Array.from(input?.files ?? []);
		if (input) input.value = '';
		const target = step;
		if (!files.length || busy || !target) return;
		const replaced = stepPhotos.map((photo) => photo.id);
		busy = true;
		clearTimeout(timer);
		justSaved = false;
		let added = 0;
		for (const [i, file] of files.entries()) {
			progress = { n: i + 1, total: files.length };
			try {
				await addPhotoFromFile(roomId, file, {
					...target.perspective,
					caption: { ...target.perspective.caption }
				});
				added++;
			} catch (error) {
				toasts.show({ message: errorMessage(error, file.name), kind: 'error', duration: 8000 });
			}
		}
		busy = false;
		progress = null;
		if (!added) return;
		for (const id of replaced) store.removePhoto(roomId, id);
		justSaved = true;
		timer = setTimeout(() => go(index + 1), ADVANCE_DELAY);
	}
</script>

{#if step && room}
	<div class="flex flex-col gap-4" data-testid="tour-view">
		<div class="flex items-center gap-2">
			<IconButton
				icon={X}
				label={t(messages, 'closeTour')}
				onclick={finish}
				data-testid="tour-close"
			/>
			<div class="min-w-0 grow">
				<p class="text-sm font-semibold text-muted">
					{t(messages, 'stepOf', { n: index + 1, total: steps.length })}
				</p>
				<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-(--duration-base) ease-soft"
						style:width="{((index + 1) / steps.length) * 100}%"
					></div>
				</div>
			</div>
			{#if step.optional}
				<span
					class="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted pointer-coarse:text-sm"
				>
					{t(messages, 'optional')}
				</span>
			{/if}
		</div>

		<h3 class="text-xl font-bold tracking-tight" data-testid="tour-caption">
			{pick(step.perspective.caption)}
		</h3>

		<MiniPlan {room} {step} />

		<div class="flex flex-col gap-2">
			<p class="text-base">{t(messages, hint as 'hintWall')}</p>
			{#if wideAngle}
				<p class="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
					<Camera class="mt-0.5 size-4 shrink-0" />
					{t(messages, 'hintWide')}
				</p>
			{/if}
		</div>

		{#if stepPhotos.length}
			<div
				class="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 {justSaved
					? 'animate-pop-in border-accent'
					: ''}"
				data-testid="tour-result"
			>
				<div class="flex gap-1.5">
					{#each stepPhotos.slice(0, 3) as photo (photo.id)}
						<div class="size-16 overflow-hidden rounded-md bg-surface-2">
							{#if thumbs.urls[photo.hash]}
								<img src={thumbs.urls[photo.hash]} alt="" class="size-full object-cover" />
							{:else}
								<div class="flex size-full items-center justify-center text-muted">
									<ImageOff class="size-5" />
								</div>
							{/if}
						</div>
					{/each}
				</div>
				<p class="flex items-center gap-1.5 font-semibold text-accent">
					<Check class="size-5" />
					{t(messages, 'saved')}
				</p>
			</div>
		{/if}

		<div class="sticky -bottom-6 z-10 -mx-5 -mb-2 bg-surface/95 px-5 py-2 backdrop-blur">
			<Button
				variant="primary"
				size="lg"
				full
				icon={stepPhotos.length ? RotateCcw : Camera}
				loading={busy}
				onclick={() => cameraInput?.click()}
				data-testid="tour-capture"
			>
				{stepPhotos.length ? t(messages, 'recapture') : t(messages, 'capture')}
			</Button>
		</div>
		<div class="flex flex-col gap-2.5">
			<Button
				variant="secondary"
				full
				icon={Images}
				disabled={busy}
				onclick={() => libraryInput?.click()}
				data-testid="tour-library"
			>
				{t(messages, 'library')}
			</Button>
			{#if progress}
				<p class="text-center text-sm text-muted" role="status">
					{progress.total > 1 ? t(messages, 'processingMany', progress) : t(messages, 'processing')}
				</p>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-2">
			<Button
				variant="ghost"
				icon={ChevronLeft}
				disabled={busy || index === 0}
				onclick={() => go(index - 1)}
			>
				{t(messages, 'previous')}
			</Button>
			{#if stepPhotos.length}
				<Button
					variant="ghost"
					icon={isLast ? Check : ChevronRight}
					disabled={busy}
					onclick={() => go(index + 1)}
					data-testid="tour-next"
				>
					{isLast ? t(messages, 'done') : t(messages, 'next')}
				</Button>
			{:else}
				<Button
					variant="ghost"
					icon={SkipForward}
					disabled={busy}
					onclick={() => go(index + 1)}
					data-testid="tour-skip"
				>
					{isLast ? t(messages, 'done') : t(messages, 'skip')}
				</Button>
			{/if}
		</div>

		<input
			bind:this={cameraInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="sr-only"
			tabindex="-1"
			aria-hidden="true"
			onchange={() => handleFiles(cameraInput)}
			data-testid="tour-camera-input"
		/>
		<input
			bind:this={libraryInput}
			type="file"
			accept="image/*"
			multiple
			class="sr-only"
			tabindex="-1"
			aria-hidden="true"
			onchange={() => handleFiles(libraryInput)}
			data-testid="tour-library-input"
		/>
	</div>
{/if}
