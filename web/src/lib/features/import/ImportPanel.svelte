<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ClipboardCopy from '@lucide/svelte/icons/clipboard-copy';
	import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Info from '@lucide/svelte/icons/info';
	import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ensureFullCatalog, fullCatalog } from '#lib/catalog/full.svelte.ts';
	import { lookup } from '#lib/catalog/index.ts';
	import { formatChf } from '#lib/core/units.ts';
	import SectionCard from '#lib/features/export/SectionCard.svelte';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { messages as projectMessages } from '#lib/features/projects/i18n.ts';
	import { LIMITS } from '#lib/security/limits.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import {
		analyzePlanText,
		briefDiffers,
		importable,
		pickVariants,
		type Analysis
	} from './analyze.ts';
	import { correctionText } from './feedback.ts';
	import { messages } from './i18n.ts';

	const SHOWN = LIMITS.reportedIssues;

	let text = $state('');
	let dragging = $state(false);
	let selected = $state<number[]>([]);
	let includeBrief = $state(false);
	let fileInput = $state<HTMLInputElement>();

	void ensureFullCatalog();

	const analysis = $derived.by((): Analysis => {
		const project = store.project;
		void fullCatalog.count;
		if (!project) return { status: 'empty' };
		return analyzePlanText(text, {
			project,
			lookup,
			language: locale.language,
			unit: settings.unit
		});
	});

	const corrections = $derived(correctionText(analysis, locale.language));

	const briefChoice = $derived(
		analysis.status === 'ready' &&
			store.project !== null &&
			briefDiffers(store.project, analysis.resolved.brief)
	);

	$effect(() => {
		const current = analysis;
		untrack(() => {
			if (current.status !== 'ready') return;
			selected = current.resolved.variants.flatMap((variant, index) =>
				importable(variant) ? [index] : []
			);
			includeBrief = !store.project?.brief;
		});
	});

	async function readFile(file: File): Promise<void> {
		if (file.size > LIMITS.planText) {
			toasts.show({ message: t(messages, 'fileTooBig'), kind: 'error' });
			return;
		}
		try {
			text = await file.text();
		} catch {
			toasts.show({ message: t(messages, 'fileUnreadable'), kind: 'error' });
		}
	}

	function onPick(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void readFile(file);
	}

	function onDrop(event: DragEvent): void {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) void readFile(file);
	}

	async function pasteFromClipboard(): Promise<void> {
		try {
			const pasted = await navigator.clipboard.readText();
			if (pasted.length > LIMITS.planText) {
				toasts.show({ message: t(messages, 'fileTooBig'), kind: 'error' });
				return;
			}
			text = pasted;
		} catch {
			toasts.show({ message: t(messages, 'clipboardFailed'), kind: 'error' });
		}
	}

	async function copyCorrections(content: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(content);
			toasts.show({ message: t(messages, 'copied'), kind: 'success' });
		} catch {
			toasts.show({ message: t(messages, 'clipboardFailed'), kind: 'error' });
		}
	}

	function toggleVariant(index: number, on: boolean): void {
		selected = on ? [...selected, index] : selected.filter((value) => value !== index);
	}

	const picked = $derived(
		analysis.status === 'ready'
			? pickVariants(analysis.resolved, new Set(selected), includeBrief && briefChoice)
			: { variants: [] }
	);

	function apply(): void {
		const project = store.project;
		if (store.readOnly || analysis.status !== 'ready' || !project || picked.variants.length === 0) {
			return;
		}
		if (project.variants.length + picked.variants.length > LIMITS.variants) {
			toasts.show({
				message: t(messages, 'tooManyVariants', { max: LIMITS.variants }),
				kind: 'error'
			});
			return;
		}
		const id = project.id;
		const count = picked.variants.length;
		if (!store.importVariants(picked.variants, 'brief' in picked ? picked.brief : undefined))
			return;
		text = '';
		toasts.show({
			message: t(messages, count === 1 ? 'applied_one' : 'applied_other', { n: count }),
			kind: 'success',
			actionLabel: t(messages, 'view'),
			onaction: () => void goto(resolve('/p/[id]/furnish', { id }))
		});
	}
</script>

{#snippet copyButton(content: string)}
	<div>
		<Button
			variant="secondary"
			icon={ClipboardCopy}
			onclick={() => void copyCorrections(content)}
			data-testid="import-copy-corrections"
		>
			{t(messages, 'copyCorrections')}
		</Button>
	</div>
{/snippet}

{#snippet more(total: number)}
	{#if total > SHOWN}
		<p class="px-1 text-sm text-muted">{t(messages, 'listMore', { n: total - SHOWN })}</p>
	{/if}
{/snippet}

<div
	class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 pt-5 pr-[max(1.25rem,var(--safe-right))] pb-[max(3rem,var(--safe-bottom))] pl-[max(1.25rem,var(--safe-left))]"
	data-testid="import-panel"
>
	<SectionCard title={t(messages, 'sectionImport')} icon={Upload} data-testid="import-card">
		<p class="text-base text-muted">{t(messages, 'importText')}</p>

		<button
			type="button"
			class="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition duration-(--duration-fast) ease-soft {dragging
				? 'border-accent bg-accent-soft text-accent'
				: 'border-border bg-bg text-muted hover:bg-surface-2'}"
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
			onclick={() => fileInput?.click()}
			data-testid="import-drop"
		>
			<FileUp class="size-7" />
			<span class="text-base font-semibold">{t(messages, 'dropHint')}</span>
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept=".json,.txt,.md,application/json,text/plain"
			class="hidden"
			onchange={onPick}
			data-testid="import-file"
		/>

		<div class="flex flex-col gap-2">
			<label for="import-text" class="px-1 text-sm font-semibold text-muted">
				{t(messages, 'pasteLabel')}
			</label>
			<textarea
				id="import-text"
				bind:value={text}
				rows="6"
				spellcheck="false"
				autocapitalize="off"
				autocomplete="off"
				placeholder={t(messages, 'pastePlaceholder')}
				class="min-h-36 w-full resize-y rounded-md border border-border bg-bg p-3 font-mono text-sm text-text placeholder:text-muted focus:border-accent focus:outline-2 focus:outline-offset-1 focus:outline-accent pointer-coarse:text-base"
				data-testid="import-text"></textarea>
			<div class="flex flex-wrap gap-2">
				<Button
					variant="secondary"
					icon={ClipboardPaste}
					onclick={() => void pasteFromClipboard()}
					data-testid="import-clipboard"
				>
					{t(messages, 'fromClipboard')}
				</Button>
				{#if text !== ''}
					<Button variant="ghost" icon={X} onclick={() => (text = '')} data-testid="import-clear">
						{t(messages, 'clear')}
					</Button>
				{/if}
			</div>
		</div>

		{#if analysis.status === 'unreadable'}
			<div
				class="flex flex-col gap-3 rounded-md bg-danger-soft p-4"
				role="alert"
				data-testid="import-unreadable"
			>
				<div class="flex items-start gap-3 text-danger">
					<OctagonAlert class="mt-0.5 size-5 shrink-0" />
					<p class="text-sm font-medium">
						{t(
							messages,
							analysis.reason === 'noJson'
								? 'unreadableNoJson'
								: analysis.reason === 'truncated'
									? 'unreadableTruncated'
									: analysis.reason === 'tooLarge'
										? 'unreadableTooLarge'
										: 'unreadableBroken'
						)}
					</p>
				</div>
				{#if corrections}
					{@render copyButton(corrections)}
				{/if}
			</div>
		{:else if analysis.status === 'invalid'}
			{@const errors = analysis.errors}
			<div class="flex flex-col gap-3 rounded-md bg-danger-soft p-4" data-testid="import-invalid">
				<div class="flex items-start gap-3 text-danger">
					<OctagonAlert class="mt-0.5 size-5 shrink-0" />
					<div>
						<p class="font-bold">{t(messages, 'invalidTitle')}</p>
						<p class="mt-0.5 text-sm">{t(messages, 'invalidText')}</p>
					</div>
				</div>
				<ul class="flex flex-col gap-1.5 text-sm text-text">
					{#each errors as line (line)}
						<li class="rounded-sm bg-surface px-3 py-2 break-words">{line}</li>
					{/each}
				</ul>
				{#if corrections}
					{@render copyButton(corrections)}
				{/if}
			</div>
		{/if}
	</SectionCard>

	{#if analysis.status === 'ready'}
		{@const ready = analysis}
		{@const multiple = ready.preview.length > 1}
		<SectionCard
			title={t(messages, 'previewTitle')}
			icon={CircleCheck}
			data-testid="import-preview"
		>
			{#if ready.skipped > 0}
				<div
					class="flex items-start gap-3 rounded-md bg-warning-soft p-3 text-warning"
					data-testid="import-partial"
				>
					<TriangleAlert class="mt-0.5 size-5 shrink-0" />
					<p class="text-sm font-medium">{t(messages, 'partialBanner')}</p>
				</div>
			{/if}

			{#each ready.preview as variant (variant.index)}
				{@const variantData = ready.resolved.variants[variant.index]}
				<article
					class="flex flex-col gap-4 rounded-md border border-border bg-bg p-4 {multiple &&
					!selected.includes(variant.index)
						? 'opacity-60'
						: ''}"
					data-testid="import-variant"
				>
					<header class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<h3 class="text-lg font-bold break-words">
								{t(messages, 'variantTitle', { n: variant.index + 1, name: variant.name })}
							</h3>
							<p class="mt-0.5 text-sm text-muted">
								<span class="font-semibold text-text" data-testid="import-total">
									{t(messages, 'variantTotal', {
										amount: formatChf(variant.totalChf, locale.language)
									})}
								</span>
								{#if variant.unpriced > 0}
									· {t(messages, 'variantUnpriced', { n: variant.unpriced })}
								{/if}
							</p>
						</div>
						{#if multiple && importable(variantData)}
							<Switch
								label={t(messages, 'variantInclude')}
								checked={selected.includes(variant.index)}
								onchange={(on) => toggleVariant(variant.index, on)}
								class="min-h-11"
							/>
						{/if}
					</header>

					{#each variant.rooms as room (room.roomId)}
						<div class="flex flex-col gap-2" data-testid="import-room">
							<p class="font-semibold">
								{room.name}{#if room.floorName}<span class="font-normal text-muted">
										({room.floorName})</span
									>{/if}<span class="font-normal text-muted">: {room.summary}</span>
							</p>
							{#if room.errors.length > 0}
								<div class="flex flex-col gap-1.5" data-testid="import-conflicts">
									<p
										class="px-1 text-xs font-bold tracking-wide text-danger uppercase pointer-coarse:text-sm"
									>
										{t(messages, 'conflictsTitle')}
									</p>
									{#each room.errors.slice(0, SHOWN) as conflict, index (index)}
										<p
											class="flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger"
										>
											<OctagonAlert class="mt-0.5 size-4 shrink-0" />
											<span>{conflict.text}</span>
										</p>
									{/each}
									{@render more(room.errors.length)}
								</div>
							{/if}
							{#if room.warnings.length > 0}
								<div class="flex flex-col gap-1.5" data-testid="import-warnings">
									<p
										class="px-1 text-xs font-bold tracking-wide text-warning uppercase pointer-coarse:text-sm"
									>
										{t(messages, 'warningsTitle')}
									</p>
									{#each room.warnings.slice(0, SHOWN) as conflict, index (index)}
										<p
											class="flex items-start gap-2 rounded-sm bg-warning-soft px-3 py-2 text-sm text-warning"
										>
											<TriangleAlert class="mt-0.5 size-4 shrink-0" />
											<span>{conflict.text}</span>
										</p>
									{/each}
									{@render more(room.warnings.length)}
								</div>
							{/if}
						</div>
					{/each}
					{#if variant.rooms.length === 0}
						<p class="text-sm text-muted">{t(messages, 'noRooms')}</p>
					{/if}

					{#if variant.issues.some((issue) => issue.severity === 'error')}
						<div class="flex flex-col gap-1.5" data-testid="import-skipped">
							<p
								class="px-1 text-xs font-bold tracking-wide text-danger uppercase pointer-coarse:text-sm"
							>
								{t(messages, 'skippedTitle')}
							</p>
							{#each variant.issues
								.filter((issue) => issue.severity === 'error')
								.slice(0, SHOWN) as issue, index (index)}
								<p class="rounded-sm bg-danger-soft px-3 py-2 text-sm text-text">
									<span class="font-semibold">{issue.where}</span><br />
									<span class="text-danger">{issue.message}</span>
								</p>
							{/each}
							{@render more(variant.issues.filter((issue) => issue.severity === 'error').length)}
						</div>
					{/if}
					{#if variant.issues.some((issue) => issue.severity !== 'error')}
						<div class="flex flex-col gap-1.5">
							<p
								class="px-1 text-xs font-bold tracking-wide text-muted uppercase pointer-coarse:text-sm"
							>
								{t(messages, 'planNotesTitle')}
							</p>
							{#each variant.issues
								.filter((issue) => issue.severity !== 'error')
								.slice(0, SHOWN) as issue, index (index)}
								<p class="flex items-start gap-2 rounded-sm bg-surface-2 px-3 py-2 text-sm">
									<Info class="mt-0.5 size-4 shrink-0 text-muted" />
									<span>
										<span class="font-semibold">{issue.where}</span>: {issue.message}
									</span>
								</p>
							{/each}
							{@render more(variant.issues.filter((issue) => issue.severity !== 'error').length)}
						</div>
					{/if}
				</article>
			{/each}

			{#if briefChoice}
				<Switch
					bind:checked={includeBrief}
					label={t(messages, 'includeBrief')}
					description={t(messages, 'includeBriefHint')}
				/>
			{/if}

			{#if corrections}
				<div
					class="flex flex-col gap-2 rounded-md bg-surface-2 p-3"
					data-testid="import-corrections"
				>
					<p class="text-sm text-muted">{t(messages, 'correctionsHint')}</p>
					{@render copyButton(corrections)}
				</div>
			{/if}
			{#if store.readOnly}
				<p class="rounded-md bg-surface-2 p-3 text-sm text-muted" data-testid="import-readonly">
					{t(projectMessages, 'readOnlyText')}
				</p>
			{:else if picked.variants.length === 0}
				<p class="rounded-md bg-surface-2 p-3 text-sm text-muted">
					{t(messages, 'nothingToImport')}
				</p>
			{/if}
			<div>
				<Button
					variant="primary"
					size="lg"
					disabled={picked.variants.length === 0 || store.readOnly}
					onclick={apply}
					data-testid="import-apply"
				>
					{picked.variants.length > 1
						? t(messages, 'applyMany', { n: picked.variants.length })
						: t(messages, 'apply')}
				</Button>
			</div>
		</SectionCard>
	{/if}
</div>
