<script lang="ts">
	import Bug from '@lucide/svelte/icons/bug';
	import ClipboardCopy from '@lucide/svelte/icons/clipboard-copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Mail from '@lucide/svelte/icons/mail';
	import { BUILD_DATE, LOCAL_ONLY, VERSION } from '#lib/edition.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { copyText } from '#lib/diagnostics/copy.ts';
	import { browserEnv } from '#lib/diagnostics/env.ts';
	import { feedbackChannels, type FeedbackKind } from '#lib/diagnostics/feedback.ts';
	import { messages } from '#lib/diagnostics/i18n.ts';
	import { collectDiagnostics, formatDiagnostics } from '#lib/diagnostics/report.ts';
	import Button from '#lib/ui/Button.svelte';

	const channels = feedbackChannels();
	const labelKeys = { issues: 'feedbackIssues', email: 'feedbackEmail' } as const satisfies Record<
		FeedbackKind,
		string
	>;
	const hintKeys = {
		issues: 'feedbackIssuesHint',
		email: 'feedbackEmailHint'
	} as const satisfies Record<FeedbackKind, string>;

	let text = $state('');
	let outcome = $state<'idle' | 'copied' | 'failed'>('idle');
	let copying = $state(false);

	async function read(): Promise<string> {
		const next = formatDiagnostics(await collectDiagnostics(browserEnv()));
		text = next;
		return next;
	}

	$effect(() => {
		void read();
	});

	async function copy(): Promise<void> {
		copying = true;
		outcome = (await copyText(await read())) ? 'copied' : 'failed';
		copying = false;
	}
</script>

<section
	class="rounded-lg border border-border bg-surface p-5 shadow-soft"
	data-testid="diagnostics-section"
>
	<h2 class="mb-4 text-sm font-bold tracking-wide text-muted uppercase">
		{t(messages, 'title')}
	</h2>
	<div class="flex flex-col gap-5">
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="text-muted">{t(messages, 'version')}</dt>
			<dd class="font-semibold" data-testid="diag-version">{VERSION}</dd>
			<dt class="text-muted">{t(messages, 'buildDate')}</dt>
			<dd data-testid="diag-build">{BUILD_DATE}</dd>
			<dt class="text-muted">{t(messages, 'edition')}</dt>
			<dd data-testid="diag-edition">
				{LOCAL_ONLY ? t(messages, 'editionPublic') : t(messages, 'editionServer')}
			</dd>
		</dl>

		<div class="flex flex-col gap-2">
			<div>
				<Button
					variant="secondary"
					icon={ClipboardCopy}
					loading={copying}
					onclick={() => void copy()}
					data-testid="diag-copy"
				>
					{t(messages, 'copy')}
				</Button>
			</div>
			<p class="px-1 text-sm text-muted">{t(messages, 'hint')}</p>
			<p
				class="px-1 text-sm {outcome === 'failed' ? 'text-danger' : 'text-accent'}"
				role="status"
				data-testid="diag-outcome"
			>
				{outcome === 'copied'
					? t(messages, 'copied')
					: outcome === 'failed'
						? t(messages, 'copyFailed')
						: ''}
			</p>
			<details class="px-1" open={outcome === 'failed'}>
				<summary class="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted">
					{t(messages, 'preview')}
				</summary>
				<textarea
					readonly
					rows="14"
					value={text}
					aria-label={t(messages, 'previewLabel')}
					class="mt-1 field-sizing-content max-h-96 w-full resize-none rounded-md border border-border bg-surface-2 p-3 font-mono text-xs text-text"
					onfocus={(event) => event.currentTarget.select()}
					data-testid="diag-text"></textarea>
			</details>
		</div>

		<div class="flex flex-col gap-3">
			{#each channels as channel (channel.kind)}
				<div class="flex flex-col">
					<a
						href={channel.href}
						target={channel.kind === 'email' ? undefined : '_blank'}
						rel="noopener noreferrer"
						referrerpolicy="no-referrer"
						class="inline-flex min-h-11 items-center gap-2 self-start rounded-md px-1 font-semibold text-accent underline-offset-4 hover:underline"
						data-testid="diag-feedback-{channel.kind}"
					>
						{#if channel.kind === 'email'}<Mail class="size-5 shrink-0" />{:else}<Bug
								class="size-5 shrink-0"
							/>{/if}
						{t(messages, labelKeys[channel.kind])}
						{#if channel.kind !== 'email'}<ExternalLink class="size-4 shrink-0" />{/if}
					</a>
					<p class="px-1 text-sm text-muted">{t(messages, hintKeys[channel.kind])}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
