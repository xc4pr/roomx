<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Box from '@lucide/svelte/icons/box';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import FileArchive from '@lucide/svelte/icons/file-archive';
	import Download from '@lucide/svelte/icons/download';
	import Package from '@lucide/svelte/icons/package';
	import PackageOpen from '@lucide/svelte/icons/package-open';
	import Share2 from '@lucide/svelte/icons/share-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import X from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatDate } from '#lib/core/units.ts';
	import BuildCheck from '#lib/features/board/BuildCheck.svelte';
	import { formatBytes } from '#lib/features/settings/storage.ts';
	import { common } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { settings, updateSettings } from '#lib/state/settings.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Celebrate from './Celebrate.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import ProgressRing from '#lib/ui/ProgressRing.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import {
		BackupError,
		createBackup,
		parseBackup,
		projectExists,
		restoreBackup,
		type BackupExtra,
		type ParsedBackup
	} from './backup.ts';
	import { browserDeps, makeThumbnail } from './browser.ts';
	import {
		canShareFiles,
		copySelection,
		copyText,
		downloadBlob,
		downloadFiles,
		selectNode,
		shareFiles,
		toFiles,
		zipPackage
	} from './deliver.ts';
	import { messages } from './i18n.ts';
	import { estimatePackage, PACKAGE_FILE_COUNT } from './layout.ts';
	import { buildPackage } from './package.ts';
	import SectionCard from './SectionCard.svelte';
	import { exportFileName } from './slug.ts';

	type JobKind = 'package' | 'backup' | 'model';

	const steps = ['step1', 'step2', 'step3', 'step4'] as const;

	interface ReadyPackage {
		files: File[];
		zipName: string;
		prompt: string;
		pageCount: number;
		pdfSize: number;
		jsonSize: number;
		totalSize: number;
		zip: () => Blob;
		tooLarge: boolean;
	}

	let scope = $state<'all' | 'rooms'>('all');
	let selected = $state<string[]>([]);
	let includePackage = $state(false);
	let includeModel = $state(false);
	let checking = $state(false);
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let promptEl = $state<HTMLElement>();
	let job = $state<{ kind: JobKind; progress: number | undefined } | null>(null);
	let ready = $state<ReadyPackage | null>(null);
	let pendingRestore = $state<ParsedBackup | null>(null);
	let askingRestore = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let controller: AbortController | null = null;
	let celebrating = $state<'backup' | 'model' | null>(null);
	let celebrateTimer: ReturnType<typeof setTimeout> | undefined;

	function celebrate(kind: 'backup' | 'model'): void {
		clearTimeout(celebrateTimer);
		celebrating = kind;
		celebrateTimer = setTimeout(() => (celebrating = null), 2600);
	}

	const project = $derived(store.project);
	const rooms = $derived(project?.rooms ?? []);
	const roomIds = $derived(
		scope === 'all'
			? rooms.map((room) => room.id)
			: rooms.filter((room) => selected.includes(room.id)).map((room) => room.id)
	);
	const estimate = $derived.by(() => {
		const items = store.activeVariant?.items ?? [];
		return estimatePackage(
			rooms
				.filter((room) => roomIds.includes(room.id))
				.map((room) => ({
					walls: room.polygon.length,
					photos: room.photos.length,
					items: items.filter((item) => item.roomId === room.id).length
				}))
		);
	});
	const busy = $derived(job !== null);
	const percent = $derived(Math.round((job?.progress ?? 0) * 100));

	function toggleRoom(id: string): void {
		selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
		ready = null;
	}

	function isAbort(error: unknown): boolean {
		return error instanceof DOMException && error.name === 'AbortError';
	}

	function begin(kind: JobKind): AbortSignal {
		controller = new AbortController();
		job = { kind, progress: kind === 'package' ? 0 : undefined };
		return controller.signal;
	}

	function finish(): void {
		job = null;
		controller = null;
	}

	function cancel(): void {
		controller?.abort();
	}

	function startPackage(): void {
		ready = null;
		checking = true;
	}

	async function createPackage(): Promise<void> {
		const snapshot = store.snapshot();
		if (!snapshot || roomIds.length === 0) return;
		ready = null;
		const signal = begin('package');
		try {
			const result = await buildPackage(
				{
					project: snapshot,
					roomIds: scope === 'all' ? undefined : roomIds,
					language: locale.language,
					signal,
					onProgress: (value) => {
						if (job) job.progress = value;
					}
				},
				browserDeps
			);
			copied = false;
			ready = {
				files: toFiles(result.files),
				zipName: result.zipName,
				prompt: result.prompt,
				pageCount: result.pageCount,
				pdfSize: result.pdf.data.length,
				jsonSize: result.json.data.length,
				totalSize: result.files.reduce((sum, file) => sum + file.data.length, 0),
				zip: () => zipPackage(result.files),
				tooLarge: result.tooLarge
			};
		} catch (error) {
			if (isAbort(error)) toasts.show({ message: t(messages, 'cancelled') });
			else {
				console.error(error);
				toasts.show({
					message: t(messages, 'packageFailed'),
					kind: 'error',
					actionLabel: t(messages, 'retry'),
					onaction: () => void createPackage()
				});
			}
		} finally {
			finish();
		}
	}

	async function shareReady(): Promise<void> {
		if (!ready) return;
		try {
			const outcome = await shareFiles(ready.files, project?.name ?? 'roomx');
			if (outcome === 'shared') toasts.show({ message: t(messages, 'shared'), kind: 'success' });
		} catch (error) {
			console.error(error);
			toasts.show({
				message: t(messages, 'shareFailed'),
				kind: 'error',
				actionLabel: t(messages, 'download'),
				onaction: () => void downloadReady()
			});
		}
	}

	async function downloadReady(): Promise<void> {
		if (!ready) return;
		await downloadFiles(ready.files);
		toasts.show({ message: t(messages, 'downloaded'), kind: 'success' });
	}

	function downloadZip(): void {
		if (!ready) return;
		downloadBlob(ready.zipName, ready.zip());
		toasts.show({ message: t(messages, 'zipDone'), kind: 'success' });
	}

	async function copyPrompt(): Promise<void> {
		if (!ready) return;
		let done = await copyText(ready.prompt);
		if (!done && promptEl) {
			selectNode(promptEl);
			done = copySelection();
		}
		if (!done) {
			toasts.show({ message: t(messages, 'promptSelected') });
			return;
		}
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 2600);
		toasts.show({ message: t(messages, 'promptCopied'), kind: 'success' });
	}

	async function modelBlob(snapshot: NonNullable<typeof project>, ids: string[]): Promise<Blob> {
		const { exportGlb } = await import('#lib/three/offscreen.ts');
		return exportGlb({ project: snapshot, roomIds: ids, variantId: snapshot.activeVariantId });
	}

	async function exportModel(): Promise<void> {
		const snapshot = store.snapshot();
		if (!snapshot || roomIds.length === 0) return;
		begin('model');
		try {
			downloadBlob(exportFileName(snapshot.name, 'glb'), await modelBlob(snapshot, roomIds));
			celebrate('model');
			toasts.show({ message: t(messages, 'modelDone'), kind: 'success' });
		} catch (error) {
			console.error(error);
			toasts.show({
				message: t(messages, 'modelFailed'),
				kind: 'error',
				actionLabel: t(messages, 'retry'),
				onaction: () => void exportModel()
			});
		} finally {
			finish();
		}
	}

	async function backup(): Promise<void> {
		const snapshot = store.snapshot();
		if (!snapshot) return;
		const signal = begin('backup');
		try {
			const extras: BackupExtra[] = [];
			if (includePackage) {
				const result = await buildPackage(
					{ project: snapshot, language: locale.language, signal },
					browserDeps
				);
				extras.push(
					...result.files.map((file) => ({
						name: file.name,
						data: file.data,
						compress: file.type !== 'application/pdf'
					}))
				);
			}
			if (includeModel && snapshot.rooms.length > 0) {
				signal.throwIfAborted();
				const blob = await modelBlob(
					snapshot,
					snapshot.rooms.map((room) => room.id)
				);
				extras.push({
					name: exportFileName(snapshot.name, 'glb'),
					data: new Uint8Array(await blob.arrayBuffer())
				});
			}
			signal.throwIfAborted();
			const { blob } = await createBackup(snapshot, { extras });
			downloadBlob(exportFileName(snapshot.name, 'zip'), blob);
			updateSettings({ lastBackupAt: new Date().toISOString() });
			celebrate('backup');
			toasts.show({ message: t(messages, 'backupDone'), kind: 'success' });
		} catch (error) {
			if (isAbort(error)) toasts.show({ message: t(messages, 'cancelled') });
			else {
				console.error(error);
				toasts.show({
					message: t(messages, 'backupFailed'),
					kind: 'error',
					actionLabel: t(messages, 'retry'),
					onaction: () => void backup()
				});
			}
		} finally {
			finish();
		}
	}

	async function onRestoreFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		let parsed: ParsedBackup;
		try {
			parsed = parseBackup(new Uint8Array(await file.arrayBuffer()));
		} catch (error) {
			toasts.show({
				message: t(
					messages,
					error instanceof BackupError && error.code === 'tooNew'
						? 'restoreTooNew'
						: 'restoreFailed'
				),
				kind: 'error'
			});
			return;
		}
		if (await projectExists(parsed.project.id)) {
			pendingRestore = parsed;
			askingRestore = true;
		} else {
			await restore(parsed, 'replace');
		}
	}

	async function restore(parsed: ParsedBackup, mode: 'replace' | 'copy'): Promise<void> {
		askingRestore = false;
		pendingRestore = null;
		try {
			if (mode === 'replace' && store.project?.id === parsed.project.id) await store.flush();
			const result = await restoreBackup(parsed, {
				mode,
				copySuffix: t(messages, 'copySuffix'),
				makeThumbnail
			});
			if (mode === 'replace' && store.project?.id === result.project.id) {
				store.replace(result.project);
			}
			const params = { name: result.project.name, n: result.missingPhotos };
			toasts.show({
				message: t(
					messages,
					result.missingPhotos === 0
						? 'restoreDone'
						: result.missingPhotos === 1
							? 'restoreDoneMissingOne'
							: 'restoreDoneMissing',
					params
				),
				kind: 'success',
				actionLabel: t(messages, 'restoreOpen'),
				onaction: () => void goto(resolve('/p/[id]', { id: result.project.id }))
			});
		} catch (error) {
			console.error(error);
			toasts.show({
				message: t(messages, 'restoreStorage'),
				kind: 'error',
				actionLabel: t(messages, 'retry'),
				onaction: () => void restore(parsed, mode)
			});
		}
	}
</script>

{#snippet progress(label: string)}
	<div class="flex flex-wrap items-center gap-4" role="status" data-testid="export-progress">
		<div class="text-accent">
			<ProgressRing value={job?.progress} size={40} stroke={4} {label} />
		</div>
		<div class="min-w-0 grow">
			<p class="font-semibold">{label}</p>
			{#if job?.progress !== undefined}
				<div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-(--duration-base) ease-soft"
						style:width="{percent}%"
					></div>
				</div>
				<p class="mt-1 text-sm text-muted">{t(messages, 'percent', { percent })}</p>
			{/if}
		</div>
		<Button variant="secondary" icon={X} onclick={cancel} data-testid="export-cancel">
			{t(messages, 'cancel')}
		</Button>
	</div>
{/snippet}

<div
	class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 pt-[max(1.25rem,var(--safe-top))] pr-[max(1.25rem,var(--safe-right))] pl-[max(1.25rem,var(--safe-left))]"
	data-testid="export-panel"
>
	<h1 class="py-1 text-3xl font-extrabold tracking-tight">{t(common, 'share')}</h1>

	<SectionCard title={t(messages, 'sectionPackage')} icon={Package} data-testid="package-card">
		<p class="text-base text-muted">{t(messages, 'packageText')}</p>

		{#if rooms.length === 0}
			<p class="rounded-md bg-surface-2 p-3 text-sm text-muted">{t(messages, 'noRooms')}</p>
		{:else}
			<div class="flex flex-col gap-2">
				<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'scopeLabel')}</span>
				<SegmentedControl
					label={t(messages, 'scopeLabel')}
					value={scope}
					size="lg"
					full
					items={[
						{ value: 'all', label: t(messages, 'scopeAll') },
						{ value: 'rooms', label: t(messages, 'scopeRooms') }
					]}
					onchange={(value) => {
						scope = value as 'all' | 'rooms';
						ready = null;
					}}
				/>
			</div>

			{#if scope === 'rooms'}
				<div class="flex flex-col gap-2">
					<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'roomsLabel')}</span>
					<div class="flex flex-wrap gap-2" data-testid="room-chips">
						{#each rooms as room (room.id)}
							<Chip selected={selected.includes(room.id)} onclick={() => toggleRoom(room.id)}>
								{room.name}
							</Chip>
						{/each}
					</div>
					{#if roomIds.length === 0}
						<p class="px-1 text-sm text-muted">{t(messages, 'selectRooms')}</p>
					{/if}
				</div>
			{/if}

			{#if roomIds.length > 0}
				<p class="px-1 text-sm text-muted" data-testid="estimate">
					{t(messages, 'estimate', {
						pages: estimate.pages,
						files: PACKAGE_FILE_COUNT,
						size: formatBytes(estimate.bytes, locale.language)
					})}
				</p>
				{#if estimate.tooLarge}
					<div
						class="flex items-start gap-3 rounded-md bg-warning-soft p-3 text-warning"
						data-testid="too-large"
					>
						<TriangleAlert class="mt-0.5 size-5 shrink-0" />
						<p class="text-sm font-medium">
							{t(messages, 'tooLarge', {
								pages: estimate.pages,
								size: formatBytes(estimate.bytes, locale.language)
							})}
						</p>
					</div>
				{/if}
			{/if}

			{#if job?.kind === 'package'}
				{@render progress(t(messages, 'working'))}
			{:else}
				<div class="flex flex-wrap gap-2">
					<Button
						variant="primary"
						size="lg"
						icon={PackageOpen}
						disabled={busy || roomIds.length === 0}
						onclick={startPackage}
						data-testid="create-package"
					>
						{t(messages, 'createPackage')}
					</Button>
				</div>
			{/if}

			{#if ready && !busy}
				<div
					class="flex flex-col gap-4 rounded-md border border-border bg-bg p-4"
					data-testid="package-ready"
				>
					<div class="flex items-start gap-3">
						<Celebrate />
						<div class="min-w-0">
							<p class="font-bold">{t(messages, 'readyTitle')}</p>
							<p class="mt-0.5 text-sm text-muted">
								{t(messages, 'readyText', {
									files: ready.files.length,
									total: formatBytes(ready.totalSize, locale.language),
									pages: ready.pageCount,
									pdfSize: formatBytes(ready.pdfSize, locale.language),
									jsonSize: formatBytes(ready.jsonSize, locale.language)
								})}
							</p>
							<ul class="mt-2 text-sm text-muted" data-testid="package-files">
								{#each ready.files as file (file.name)}
									<li class="truncate">{file.name}</li>
								{/each}
							</ul>
							{#if ready.tooLarge}
								<p class="mt-2 text-sm font-medium text-warning">{t(messages, 'readyLarge')}</p>
							{/if}
						</div>
					</div>
					<div class="flex flex-wrap gap-2">
						{#if canShareFiles(ready.files)}
							<Button
								variant="primary"
								icon={Share2}
								onclick={() => void shareReady()}
								data-testid="share-package"
							>
								{t(messages, 'share')}
							</Button>
						{/if}
						<Button
							variant={canShareFiles(ready.files) ? 'secondary' : 'primary'}
							icon={Download}
							onclick={() => void downloadReady()}
							data-testid="download-package"
						>
							{t(messages, 'download')}
						</Button>
						<Button
							variant="secondary"
							icon={FileArchive}
							onclick={downloadZip}
							data-testid="download-zip"
						>
							{t(messages, 'zipDownload')}
						</Button>
					</div>
					<p class="-mt-2 text-xs text-muted pointer-coarse:text-sm">{t(messages, 'zipHint')}</p>

					<div class="flex flex-col gap-3 border-t border-border pt-4" data-testid="package-steps">
						<p class="font-bold">{t(messages, 'stepsTitle')}</p>
						<ol class="flex flex-col gap-3">
							{#each steps as key, index (key)}
								<li class="flex items-start gap-3">
									<span
										class="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent"
										aria-hidden="true"
									>
										{index + 1}
									</span>
									<div class="min-w-0 grow">
										<p class="pt-0.5 text-base">{t(messages, key)}</p>
										{#if index === 2}
											<div class="mt-2 flex flex-col gap-2">
												<p
													bind:this={promptEl}
													class="rounded-md border border-border bg-surface p-3 text-sm leading-relaxed whitespace-pre-wrap select-all"
													data-testid="prompt-text"
												>
													{ready.prompt}
												</p>
												<div>
													<Button
														variant="primary"
														icon={copied ? Check : Copy}
														onclick={() => void copyPrompt()}
														data-testid="copy-prompt"
													>
														{copied ? t(messages, 'promptCopiedShort') : t(messages, 'copyPrompt')}
													</Button>
												</div>
											</div>
										{/if}
									</div>
								</li>
							{/each}
						</ol>
					</div>
				</div>
			{/if}
		{/if}
	</SectionCard>

	<SectionCard
		id="backup"
		title={t(messages, 'sectionBackup')}
		icon={Archive}
		data-testid="backup-card"
		class="scroll-mt-5"
	>
		<p class="text-base text-muted">{t(messages, 'backupText')}</p>
		<div class="flex flex-col">
			<Switch
				bind:checked={includePackage}
				label={t(messages, 'includePackage')}
				description={t(messages, 'includePackageHint')}
				disabled={busy || rooms.length === 0}
			/>
			<Switch
				bind:checked={includeModel}
				label={t(messages, 'includeModel')}
				description={t(messages, 'includeModelHint')}
				disabled={busy || rooms.length === 0}
			/>
		</div>
		{#if job?.kind === 'backup'}
			{@render progress(t(messages, 'workingBackup'))}
		{:else}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<Button
					variant="primary"
					icon={Archive}
					disabled={busy || !project}
					onclick={() => void backup()}
					data-testid="create-backup"
				>
					{t(messages, 'createBackup')}
				</Button>
				{#if celebrating === 'backup'}<Celebrate />{/if}
				<p class="text-sm text-muted" data-testid="last-backup">
					{settings.lastBackupAt
						? t(messages, 'lastBackup', {
								date: formatDate(settings.lastBackupAt, locale.language)
							})
						: t(messages, 'neverBackup')}
				</p>
			</div>
		{/if}
		<div class="flex flex-col gap-2 border-t border-border pt-5">
			<p class="text-sm text-muted">{t(messages, 'restoreText')}</p>
			<div>
				<Button
					variant="secondary"
					icon={ArchiveRestore}
					disabled={busy}
					onclick={() => fileInput?.click()}
					data-testid="restore"
				>
					{t(messages, 'restore')}
				</Button>
			</div>
			<input
				bind:this={fileInput}
				type="file"
				accept=".zip,application/zip"
				class="hidden"
				onchange={(event) => void onRestoreFile(event)}
				data-testid="restore-input"
			/>
		</div>
	</SectionCard>

	<SectionCard title={t(messages, 'sectionModel')} icon={Box} data-testid="model-card">
		<p class="text-base text-muted">{t(messages, 'modelText')}</p>
		{#if job?.kind === 'model'}
			{@render progress(t(messages, 'workingModel'))}
		{:else}
			<div class="flex items-center gap-4">
				<Button
					variant="secondary"
					icon={Box}
					disabled={busy || roomIds.length === 0}
					onclick={() => void exportModel()}
					data-testid="export-model"
				>
					{t(messages, 'exportModel')}
				</Button>
				{#if celebrating === 'model'}<Celebrate />{/if}
			</div>
		{/if}
	</SectionCard>
</div>

<BuildCheck
	bind:open={checking}
	{roomIds}
	title={t(messages, 'checkTitle')}
	proceedLabel={t(messages, 'exportAnyway')}
	onproceed={() => void createPackage()}
/>

<Dialog
	bind:open={askingRestore}
	title={t(messages, 'existsTitle')}
	description={t(messages, 'existsText', { name: pendingRestore?.project.name ?? '' })}
	closeLabel={t(common, 'close')}
	onclose={() => (pendingRestore = null)}
>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => ((askingRestore = false), (pendingRestore = null))}>
			{t(messages, 'cancel')}
		</Button>
		<Button
			variant="secondary"
			onclick={() => pendingRestore && void restore(pendingRestore, 'copy')}
			data-testid="restore-copy"
		>
			{t(messages, 'asCopy')}
		</Button>
		<Button
			variant="danger"
			onclick={() => pendingRestore && void restore(pendingRestore, 'replace')}
			data-testid="restore-replace"
		>
			{t(messages, 'replace')}
		</Button>
	{/snippet}
</Dialog>
