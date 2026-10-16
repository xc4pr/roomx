<script lang="ts">
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Upload from '@lucide/svelte/icons/upload';
	import { onDestroy } from 'svelte';
	import { pick, t } from '#lib/i18n/index.svelte.ts';
	import { common } from '#lib/i18n/common.ts';
	import { sha256Hex } from '#lib/features/photos/hash.ts';
	import { sniffImage } from '#lib/features/photos/sniff.ts';
	import { mirrorHost } from '#lib/mirror/host.svelte.ts';
	import { readShotTag, withoutShotComment } from '#lib/mirror/files.ts';
	import { placedPerspective, toHostStepKey } from '#lib/mirror/room.ts';
	import { MAX_SHOT_BYTES, type ShotTag } from '#lib/mirror/types.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import { messages } from './i18n.ts';
	import { classifyShot, limitFiles, MAX_IMPORT_FILES, type ImportState } from './importPlan.ts';

	type EntryState = ImportState | 'imported' | 'failed';

	interface Entry {
		id: number;
		name: string;
		url: string;
		bytes: Uint8Array<ArrayBuffer>;
		tag: ShotTag | null;
		state: EntryState;
		roomName?: string;
		caption?: string;
	}

	let { open = $bindable(false), onclose }: { open?: boolean; onclose?: () => void } = $props();

	let entries = $state<Entry[]>([]);
	let reading = $state(false);
	let importing = $state(false);
	let dragging = $state(false);
	let nextId = 0;
	let input: HTMLInputElement | undefined = $state();

	const ready = $derived(entries.filter((entry) => entry.state === 'ready'));

	function release(): void {
		for (const entry of entries) URL.revokeObjectURL(entry.url);
	}

	function reset(): void {
		release();
		entries = [];
	}

	onDestroy(release);

	$effect(() => {
		if (!open && entries.length) reset();
	});

	async function addFiles(list: readonly File[]): Promise<void> {
		if (!list.length || reading || importing) return;
		reading = true;
		const { accepted, cut } = limitFiles(list, entries.length);
		if (cut)
			toasts.show({
				message: t(messages, 'importTooMany', { max: MAX_IMPORT_FILES }),
				kind: 'info'
			});
		const added: Entry[] = [];
		for (const file of accepted) {
			if (file.size > MAX_SHOT_BYTES) {
				added.push(makeEntry(file, new Uint8Array(0), null, 'tooLarge'));
				continue;
			}
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (sniffImage(bytes) !== 'jpeg') {
				toasts.show({ message: t(messages, 'importNotJpeg', { name: file.name }), kind: 'error' });
				continue;
			}
			added.push(await describe(file, bytes));
		}
		entries = [...entries, ...added];
		reading = false;
	}

	function makeEntry(
		file: File,
		bytes: Uint8Array<ArrayBuffer>,
		tag: ShotTag | null,
		state: EntryState
	): Entry {
		return { id: nextId++, name: file.name, url: URL.createObjectURL(file), bytes, tag, state };
	}

	async function describe(file: File, bytes: Uint8Array<ArrayBuffer>): Promise<Entry> {
		const tag = readShotTag(file.name, bytes);
		const photo = withoutShotComment(bytes);
		const hash = await sha256Hex(photo);
		const plan = classifyShot(tag, hash, file.size, MAX_SHOT_BYTES, mirrorHost.jobs);
		const entry = makeEntry(file, photo, tag, plan.state);
		if (plan.roomId && plan.elementIds && tag) {
			const room = store.room(plan.roomId);
			const hostKey = toHostStepKey(tag.stepKey, plan.elementIds);
			if (room && hostKey !== null) {
				entry.roomName = room.name;
				entry.caption = pick(placedPerspective(room, hostKey, plan.corners).caption);
			} else {
				entry.state = 'untagged';
			}
		}
		return entry;
	}

	function onDrop(event: DragEvent): void {
		event.preventDefault();
		dragging = false;
		void addFiles(Array.from(event.dataTransfer?.files ?? []));
	}

	function onPick(): void {
		const files = Array.from(input?.files ?? []);
		if (input) input.value = '';
		void addFiles(files);
	}

	async function run(): Promise<void> {
		if (importing || !ready.length) return;
		importing = true;
		let imported = 0;
		let skipped = 0;
		let failed = 0;
		for (const entry of ready) {
			if (!entry.tag) continue;
			try {
				const result = await mirrorHost.importShot(entry.tag, entry.bytes);
				if (!result.ok) {
					entry.state = 'failed';
					failed++;
				} else if (result.duplicate) {
					entry.state = 'duplicate';
					skipped++;
				} else {
					entry.state = 'imported';
					imported++;
				}
			} catch {
				entry.state = 'failed';
				failed++;
			}
		}
		importing = false;
		const parts: string[] = [];
		if (imported)
			parts.push(t(messages, imported === 1 ? 'importDoneOne' : 'importDone', { n: imported }));
		if (skipped) parts.push(t(messages, 'importSkipped', { n: skipped }));
		if (failed) parts.push(t(messages, 'importFailed', { n: failed }));
		if (!parts.length) parts.push(t(messages, 'importNone'));
		toasts.show({
			message: parts.join(', '),
			kind: failed ? 'error' : imported ? 'success' : 'info',
			duration: failed ? 8000 : undefined
		});
		if (!failed) open = false;
	}

	const stateKey: Record<EntryState, Parameters<typeof t<keyof typeof messages.de>>[1]> = {
		ready: 'stateReady',
		duplicate: 'stateDuplicate',
		otherJob: 'stateOtherJob',
		untagged: 'stateUntagged',
		tooLarge: 'stateTooLarge',
		imported: 'stateImported',
		failed: 'stateFailed'
	};
</script>

<Dialog
	bind:open
	title={t(messages, 'importTitle')}
	description={t(messages, 'importIntro')}
	closeLabel={t(common, 'close')}
	size="lg"
	{onclose}
>
	<div
		class="flex flex-col gap-3 rounded-lg border-2 border-dashed p-3 {dragging
			? 'border-accent bg-accent-soft'
			: 'border-border'}"
		role="group"
		aria-label={t(messages, 'importDrop')}
		ondragover={(event) => {
			event.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
		data-testid="mirror-dropzone"
	>
		<div class="flex flex-wrap items-center gap-3">
			<Button
				icon={FolderOpen}
				loading={reading}
				disabled={importing}
				onclick={() => input?.click()}
				data-testid="mirror-import-pick"
			>
				{entries.length ? t(messages, 'importAnother') : t(messages, 'importPick')}
			</Button>
			<span class="text-sm text-muted">{t(messages, 'importDrop')}</span>
			<input
				bind:this={input}
				type="file"
				accept="image/jpeg"
				multiple
				class="sr-only"
				tabindex="-1"
				aria-hidden="true"
				onchange={onPick}
				data-testid="mirror-import-input"
			/>
		</div>

		{#if entries.length}
			<ul class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto" data-testid="mirror-import-list">
				{#each entries as entry (entry.id)}
					<li
						class="flex min-h-11 items-center gap-3 rounded-md bg-surface-2 p-2"
						data-testid="mirror-import-item"
					>
						<img
							src={entry.url}
							alt={t(messages, 'thumbnailAlt', { name: entry.name })}
							loading="lazy"
							decoding="async"
							class="size-14 shrink-0 rounded-sm bg-surface object-cover"
						/>
						<div class="min-w-0 grow text-sm">
							<p class="truncate font-medium">{entry.roomName ?? entry.name}</p>
							{#if entry.caption}
								<p class="truncate text-muted">{entry.caption}</p>
							{/if}
						</div>
						<span
							class="shrink-0 rounded-sm px-2 py-1 text-xs font-semibold {entry.state === 'ready' ||
							entry.state === 'imported'
								? 'bg-accent-soft text-accent-strong'
								: entry.state === 'failed'
									? 'bg-danger-soft text-danger'
									: 'bg-warning-soft text-text'}"
							data-state={entry.state}
						>
							{t(messages, stateKey[entry.state])}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if entries.length && !ready.length && !importing}
			<p class="text-sm text-muted" data-testid="mirror-import-hint">
				{t(messages, 'importNoneReady')}
			</p>
		{/if}
	</div>

	{#snippet actions()}
		{#if entries.length}
			<Button variant="ghost" disabled={importing} onclick={reset}
				>{t(messages, 'importClear')}</Button
			>
		{/if}
		<Button
			variant="primary"
			icon={Upload}
			loading={importing}
			disabled={!ready.length || store.readOnly}
			onclick={run}
			data-testid="mirror-import-confirm"
		>
			{t(messages, 'importButton')}{ready.length ? ` (${ready.length})` : ''}
		</Button>
	{/snippet}
</Dialog>
