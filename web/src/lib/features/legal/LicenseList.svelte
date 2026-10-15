<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.ts';
	import { externalLink } from '#lib/security/url.ts';
	import { messages } from './i18n.ts';
	import { groupByLicense, type LicenseData } from './licenseData.ts';
	import { loadLicenses } from './licenses.ts';

	let data = $state<LicenseData | null | undefined>(undefined);

	$effect(() => {
		let alive = true;
		void loadLicenses().then((loaded) => {
			if (alive) data = loaded;
		});
		return () => {
			alive = false;
		};
	});

	const groups = $derived(data ? groupByLicense(data.packages) : []);
</script>

{#if data === undefined}
	<p class="text-sm text-muted" role="status">{t(messages, 'licensesLoading')}</p>
{:else if data === null}
	<p class="rounded-md bg-surface-2 px-4 py-3 text-sm text-muted" data-testid="licenses-missing">
		{t(messages, 'licensesMissing')}
	</p>
{:else}
	<div class="flex flex-col gap-6" data-testid="licenses">
		{#each groups as group (group.license)}
			<div class="flex flex-col gap-1">
				<h4 class="text-sm font-bold">
					{group.license}
					<span class="font-normal text-muted">
						· {t(messages, group.packages.length === 1 ? 'licensesCountOne' : 'licensesCount', {
							n: group.packages.length
						})}
					</span>
				</h4>
				<ul class="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
					{#each group.packages as entry (entry.name)}
						{@const homepage = externalLink(entry.homepage)}
						<li>
							<details class="group">
								<summary
									class="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm marker:content-none"
								>
									<span class="min-w-0 flex-1 truncate font-semibold">{entry.name}</span>
									{#if entry.font}
										<span
											class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"
										>
											{t(messages, 'licenseFont')}
										</span>
									{/if}
									<span class="shrink-0 text-muted tabular-nums">{entry.version}</span>
								</summary>
								<div class="flex flex-col gap-2 px-4 pb-4 text-sm">
									{#if entry.author}<p class="text-muted">{entry.author}</p>{/if}
									{#if homepage}
										<p>
											<a
												{...homepage}
												class="font-semibold text-accent underline underline-offset-2 hover:text-accent-strong"
											>
												{t(messages, 'licenseHomepage')}
											</a>
										</p>
									{/if}
									{#if entry.text}
										<pre
											class="max-h-64 overflow-auto rounded-md bg-surface-2 p-3 text-xs leading-relaxed whitespace-pre-wrap">{entry.text}</pre>
									{:else}
										<p class="text-muted">
											{t(messages, 'licenseNoText', { license: entry.license })}
										</p>
									{/if}
								</div>
							</details>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
{/if}
