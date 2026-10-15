<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { LOCAL_ONLY } from '#lib/edition.ts';
	import { common } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { legalContent, type LegalBlock } from './content.ts';
	import { messages } from './i18n.ts';
	import InlineText from './InlineText.svelte';
	import { currentEdition, formatUpdated, visibleDocument, type VisiblePart } from './logic.ts';

	const WIDE_QUERY = '(min-width: 64rem)';

	const doc = $derived(visibleDocument(legalContent[locale.language], currentEdition(LOCAL_ONLY)));

	let cameFromApp = false;
	let firstNavigation = true;
	let wide = $state(typeof matchMedia === 'function' && matchMedia(WIDE_QUERY).matches);

	afterNavigate((navigation) => {
		if (!firstNavigation) return;
		firstNavigation = false;
		cameFromApp = navigation.from !== null;
	});

	$effect(() => {
		const query = matchMedia(WIDE_QUERY);
		const update = () => (wide = query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	function goBack(): void {
		if (cameFromApp) history.back();
		else void goto(resolve('/'));
	}

	function jump(event: MouseEvent, id: string): void {
		const target = document.getElementById(id);
		if (!target) return;
		event.preventDefault();
		const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
		target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
		target.focus({ preventScroll: true });
	}
</script>

<svelte:head>
	<title>{t(messages, 'pageTitle')} · {t(common, 'appName')}</title>
</svelte:head>

{#snippet block(item: LegalBlock)}
	{#if item.kind === 'p'}
		<p><InlineText text={item.text} /></p>
	{:else if item.kind === 'note'}
		<p class="rounded-md border-l-4 border-warning bg-warning-soft px-4 py-3 font-semibold">
			<InlineText text={item.text} />
		</p>
	{:else}
		<ul class="flex list-disc flex-col gap-2 ps-6 marker:text-muted">
			{#each item.items as entry, index (index)}
				<li><InlineText text={entry} /></li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet sectionLinks(part: VisiblePart)}
	<ol class="flex flex-col">
		{#each part.sections as section (section.anchor)}
			<li>
				<a
					href="#{section.anchor}"
					onclick={(event) => jump(event, section.anchor)}
					class="flex min-h-11 items-baseline gap-2.5 rounded-md py-2.5 text-sm hover:text-accent lg:min-h-8 lg:py-1"
				>
					<span class="w-5 shrink-0 text-end text-muted tabular-nums">{section.number}</span>
					<span>{section.title}</span>
				</a>
			</li>
		{/each}
	</ol>
{/snippet}

<div class="h-full overflow-y-auto overscroll-contain">
	<main
		class="mx-auto w-full max-w-5xl px-5 pt-[max(1rem,var(--safe-top))] pr-[max(1.25rem,var(--safe-right))] pb-[max(3rem,var(--safe-bottom))] pl-[max(1.25rem,var(--safe-left))]"
		data-testid="legal-page"
	>
		<header class="flex items-center gap-2 py-2">
			<IconButton
				icon={ChevronLeft}
				label={t(common, 'back')}
				onclick={goBack}
				data-testid="legal-back"
			/>
			<h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{t(messages, 'pageTitle')}</h1>
		</header>

		<aside
			class="mt-4 flex items-start gap-4 rounded-lg border border-accent/30 bg-accent-soft p-4 sm:p-5"
		>
			<ShieldCheck class="mt-0.5 size-6 shrink-0 text-accent" />
			<div class="min-w-0">
				<p class="text-lg font-bold" data-testid="legal-summary">{doc.summary}</p>
				<div class="mt-1 flex flex-col gap-2 leading-relaxed">
					{#each doc.lead as item, index (index)}
						{@render block(item)}
					{/each}
				</div>
				<p class="mt-3 text-sm text-muted" data-testid="legal-updated">
					{t(messages, 'updated', { date: formatUpdated(doc.updated, locale.language) })}
				</p>
			</div>
		</aside>

		<div class="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-12">
			<nav
				aria-label={t(messages, 'contents')}
				class="rounded-lg border border-border bg-surface p-4 shadow-soft lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
				data-testid="legal-toc"
			>
				<h2 class="mb-1 text-sm font-bold tracking-wide text-muted uppercase">
					{t(messages, 'contents')}
				</h2>
				<ul class="flex flex-col gap-1">
					{#each doc.parts as part (part.id)}
						<li>
							<a
								href="#{part.id}"
								onclick={(event) => jump(event, part.id)}
								class="flex min-h-11 items-center font-bold hover:text-accent"
							>
								{part.title}
							</a>
							{#if wide}
								{@render sectionLinks(part)}
							{:else}
								<details class="mb-1">
									<summary
										class="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted"
									>
										{t(messages, 'sections', { n: part.sections.length })}
									</summary>
									{@render sectionLinks(part)}
								</details>
							{/if}
						</li>
					{/each}
				</ul>
			</nav>

			<article class="min-w-0">
				{#each doc.parts as part, partIndex (part.id)}
					<section class={partIndex > 0 ? 'mt-14 border-t border-border pt-10' : ''}>
						<h2
							id={part.id}
							tabindex="-1"
							class="scroll-mt-4 text-2xl font-extrabold tracking-tight outline-none"
						>
							{part.title}
						</h2>
						<p class="mt-2 text-base leading-relaxed text-muted">{part.intro}</p>
						{#each part.sections as section (section.anchor)}
							<section class="mt-9">
								<h3
									id={section.anchor}
									tabindex="-1"
									class="flex scroll-mt-4 items-baseline gap-3 text-lg font-bold outline-none"
								>
									<span class="w-5 shrink-0 text-end text-muted tabular-nums">{section.number}</span
									>
									<span>{section.title}</span>
								</h3>
								<div class="mt-3 flex flex-col gap-3 leading-relaxed sm:ps-8">
									{#each section.blocks as item, index (index)}
										{@render block(item)}
									{/each}
								</div>
							</section>
						{/each}
					</section>
				{/each}
			</article>
		</div>
	</main>
</div>
