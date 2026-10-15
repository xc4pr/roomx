<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Images from '@lucide/svelte/icons/images';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Play from '@lucide/svelte/icons/play';
	import Plus from '@lucide/svelte/icons/plus';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import { onDestroy } from 'svelte';
	import { pick, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { common } from '#lib/i18n/common.ts';
	import { messages as projectMessages } from '#lib/features/projects/i18n.ts';
	import { LIMITS } from '#lib/security/limits.ts';
	import { errorMessage } from './errors.ts';
	import { messages } from './i18n.ts';
	import JobList from '#lib/features/mirror/JobList.svelte';
	import MirrorDialog from '#lib/features/mirror/MirrorDialog.svelte';
	import { messages as mirrorMessages } from '#lib/features/mirror/i18n.ts';
	import PhotoViewer from './PhotoViewer.svelte';
	import { addPhotoFromFile } from './process.ts';
	import { ThumbCache } from './thumbs.svelte.ts';
	import TourView from './TourView.svelte';
	import { generateTour, tourProgress, type TourStep } from './tour.ts';
	import type { Photo } from '#lib/core/schema.ts';

	let { roomId }: { roomId: string } = $props();

	const thumbs = new ThumbCache();
	onDestroy(() => thumbs.dispose());

	const room = $derived(store.room(roomId));
	const steps = $derived(room ? generateTour(room) : []);
	const progress = $derived(room ? tourProgress(room) : { done: 0, total: 0 });

	let touring = $state(false);
	let startKey = $state<string | undefined>();
	let viewing = $state<string | null>(null);
	let freeOpen = $state(false);
	let mirrorOpen = $state(false);
	let freeNote = $state('');
	let freeBusy = $state(false);
	let freeCamera: HTMLInputElement | undefined = $state();
	let freeLibrary: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (room) thumbs.sync(room.photos.map((photo) => photo.hash));
	});

	interface TourTile {
		photo?: Photo;
		step?: TourStep;
	}

	const tourTiles = $derived.by((): TourTile[] => {
		if (!room) return [];
		return steps
			.filter((step) => !step.optional)
			.flatMap((step) => {
				const photos = room.photos.filter((photo) => photo.perspective.stepKey === step.key);
				return photos.length ? photos.map((photo): TourTile => ({ photo })) : [{ step }];
			});
	});
	const moreTiles = $derived.by(() => {
		if (!room) return [];
		const shown = new Set(tourTiles.flatMap((tile) => (tile.photo ? [tile.photo.id] : [])));
		return room.photos.filter((photo) => !shown.has(photo.id));
	});

	function openTour(key?: string): void {
		startKey = key;
		touring = true;
	}

	async function addFree(input: HTMLInputElement | undefined): Promise<void> {
		const files = Array.from(input?.files ?? []);
		if (input) input.value = '';
		if (!files.length || freeBusy) return;
		freeBusy = true;
		const note = freeNote.trim();
		let added = 0;
		for (const file of files) {
			try {
				await addPhotoFromFile(
					roomId,
					file,
					{
						kind: 'free',
						caption: {
							de: note || messages.de.freeCaption,
							en: note || messages.en.freeCaption
						}
					},
					note || undefined
				);
				added++;
			} catch (error) {
				toasts.show({ message: errorMessage(error, file.name), kind: 'error', duration: 8000 });
			}
		}
		freeBusy = false;
		if (!added) return;
		freeNote = '';
		freeOpen = false;
		if (added > 1)
			toasts.show({ message: t(messages, 'photosSaved', { n: added }), kind: 'success' });
	}

	const complete = $derived(progress.total > 0 && progress.done >= progress.total);
	const startLabel = $derived(
		complete
			? t(messages, 'review')
			: progress.done > 0
				? t(messages, 'resume')
				: t(messages, 'start')
	);
</script>

{#snippet tile(photo: Photo)}
	<button
		type="button"
		class="group flex min-w-0 flex-col gap-1.5 text-left"
		onclick={() => (viewing = photo.id)}
		aria-label={t(messages, 'openPhoto', { caption: pick(photo.perspective.caption) })}
		data-testid="photo-tile"
	>
		<span
			class="relative block aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface-2 transition duration-(--duration-fast) ease-soft group-active:scale-95"
		>
			{#if thumbs.urls[photo.hash]}
				<img
					src={thumbs.urls[photo.hash]}
					alt=""
					class="size-full object-cover"
					draggable="false"
				/>
			{:else}
				<span class="flex size-full items-center justify-center text-muted">
					{#if thumbs.missing[photo.hash] && !thumbs.fetching[photo.hash]}
						<span title={t(messages, 'imageMissing')} class="flex flex-col items-center gap-1">
							<ImageOff class="size-6" />
							<span
								class="px-1 text-center text-[11px] leading-tight font-medium pointer-coarse:text-sm"
							>
								{t(messages, 'imageMissingShort')}
							</span>
						</span>
					{:else}
						<ProgressRing size={22} stroke={3} />
					{/if}
				</span>
			{/if}
		</span>
		<span class="line-clamp-2 text-xs leading-tight font-medium text-muted pointer-coarse:text-sm">
			{pick(photo.perspective.caption)}
		</span>
	</button>
{/snippet}

{#if room}
	{#if touring}
		<TourView {roomId} {startKey} {thumbs} onexit={() => (touring = false)} />
	{:else}
		<div class="flex flex-col gap-5" data-testid="photos-panel">
			<div class="flex items-center gap-4">
				<div class="relative shrink-0">
					<ProgressRing
						value={progress.total ? progress.done / progress.total : 0}
						size={64}
						stroke={6}
						class="text-accent"
						label={t(messages, 'progress', progress)}
					/>
					<span
						class="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums"
						data-testid="photos-progress"
					>
						{progress.done}/{progress.total}
					</span>
				</div>
				<div class="min-w-0">
					<h3 class="text-lg font-bold tracking-tight">{t(messages, 'title')}</h3>
					<p class="text-sm text-muted">
						{complete ? t(messages, 'complete') : t(messages, 'progress', progress)}
					</p>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<Button
					variant="primary"
					icon={Play}
					class="grow"
					onclick={() => openTour()}
					data-testid="tour-start"
				>
					{startLabel}
				</Button>
				<Button
					icon={Plus}
					disabled={store.readOnly}
					onclick={() => (freeOpen = true)}
					data-testid="free-photo"
				>
					{t(messages, 'freePhoto')}
				</Button>
				<Button icon={Smartphone} onclick={() => (mirrorOpen = true)} data-testid="mirror-open">
					{t(mirrorMessages, 'open')}
				</Button>
			</div>

			<JobList {roomId} />

			{#if store.readOnly}
				<p class="rounded-md bg-surface-2 p-3 text-sm text-muted" data-testid="photos-readonly">
					{t(projectMessages, 'readOnlyText')}
				</p>
			{:else if room.photos.length >= LIMITS.photosPerRoom}
				<p class="rounded-md bg-surface-2 p-3 text-sm text-muted" data-testid="photos-full">
					{t(messages, 'errorLimit', { max: LIMITS.photosPerRoom })}
				</p>
			{/if}

			{#if room.photos.length === 0}
				<EmptyState
					icon={Camera}
					title={t(messages, 'emptyTitle')}
					description={t(messages, 'emptyText')}
					class="py-4"
				/>
			{/if}

			{#if tourTiles.length}
				<section class="flex flex-col gap-2.5">
					<h4 class="text-sm font-semibold text-muted">{t(messages, 'galleryTour')}</h4>
					<div class="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
						{#each tourTiles as entry (entry.photo?.id ?? entry.step?.key)}
							{#if entry.photo}
								{@render tile(entry.photo)}
							{:else if entry.step}
								{@const step = entry.step}
								<button
									type="button"
									class="group flex min-w-0 flex-col gap-1.5 text-left"
									onclick={() => openTour(step.key)}
									aria-label={t(messages, 'missingTile', {
										caption: pick(step.perspective.caption)
									})}
									data-testid="missing-tile"
								>
									<span
										class="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-border text-muted transition duration-(--duration-fast) ease-soft group-hover:border-accent group-hover:text-accent group-active:scale-95"
									>
										<Camera class="size-6" />
									</span>
									<span
										class="line-clamp-2 text-xs leading-tight font-medium text-muted pointer-coarse:text-sm"
									>
										{pick(step.perspective.caption)}
									</span>
								</button>
							{/if}
						{/each}
					</div>
				</section>
			{/if}

			{#if moreTiles.length}
				<section class="flex flex-col gap-2.5">
					<h4 class="text-sm font-semibold text-muted">{t(messages, 'galleryMore')}</h4>
					<div class="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
						{#each moreTiles as photo (photo.id)}
							{@render tile(photo)}
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}

	{#if viewing}
		<PhotoViewer {roomId} photoId={viewing} onclose={() => (viewing = null)} />
	{/if}

	<MirrorDialog bind:open={mirrorOpen} roomIds={[roomId]} />

	<Dialog
		bind:open={freeOpen}
		title={t(messages, 'freePhoto')}
		description={t(messages, 'freeHint')}
		closeLabel={t(common, 'close')}
		size="sm"
	>
		<div class="flex flex-col gap-4">
			<TextField
				bind:value={freeNote}
				label={t(messages, 'freeNote')}
				placeholder={t(messages, 'freeNotePlaceholder')}
				maxlength={LIMITS.caption}
				data-testid="free-note"
			/>
			<Button
				variant="primary"
				size="lg"
				full
				icon={Camera}
				loading={freeBusy}
				disabled={store.readOnly}
				onclick={() => freeCamera?.click()}
				data-testid="free-capture"
			>
				{t(messages, 'capture')}
			</Button>
			<Button
				full
				icon={Images}
				disabled={freeBusy || store.readOnly}
				onclick={() => freeLibrary?.click()}
				data-testid="free-library"
			>
				{t(messages, 'library')}
			</Button>
			<input
				bind:this={freeCamera}
				type="file"
				accept="image/*"
				capture="environment"
				class="sr-only"
				tabindex="-1"
				aria-hidden="true"
				onchange={() => addFree(freeCamera)}
				data-testid="free-camera-input"
			/>
			<input
				bind:this={freeLibrary}
				type="file"
				accept="image/*"
				multiple
				class="sr-only"
				tabindex="-1"
				aria-hidden="true"
				onchange={() => addFree(freeLibrary)}
				data-testid="free-library-input"
			/>
		</div>
	</Dialog>
{/if}
