<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import { resolve } from '$app/paths';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { listCameraJobs, listShots } from '#lib/mirror/jobs.ts';
	import type { CameraJob } from '#lib/mirror/types.ts';
	import { messages } from './i18n.ts';

	interface OpenJob {
		job: CameraJob;
		unsent: number;
	}

	let jobs = $state<OpenJob[]>([]);

	async function load(): Promise<OpenJob[]> {
		const list = await listCameraJobs();
		return Promise.all(
			list.map(async (job) => ({ job, unsent: (await listShots(job.id)).length }))
		);
	}

	$effect(() => {
		let cancelled = false;
		function refresh(): void {
			void load().then(
				(next) => {
					if (!cancelled) jobs = next;
				},
				() => undefined
			);
		}
		refresh();
		document.addEventListener('visibilitychange', refresh);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', refresh);
		};
	});
</script>

{#if jobs.length > 0}
	<section class="mb-6 flex flex-col gap-2" data-testid="open-camera-jobs">
		<h2 class="flex items-center gap-2 text-lg font-bold">
			<Smartphone class="size-5 text-accent" />
			{t(messages, 'openJobsTitle')}
		</h2>
		<ul class="flex flex-col gap-2">
			{#each jobs as { job, unsent } (job.id)}
				<li>
					<a
						href={resolve('/m/[job]', { job: job.id })}
						class="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface p-3"
						data-testid="open-camera-job-{job.id}"
					>
						<span class="min-w-0 grow">
							<span class="block truncate font-semibold">{job.project}</span>
							{#if job.expiresAt <= Date.now() && unsent > 0}
								<span
									class="flex items-center gap-1 text-sm font-semibold"
									data-testid="open-camera-job-expired-{job.id}"
								>
									<TriangleAlert class="size-4 shrink-0" />
									{t(messages, unsent === 1 ? 'openJobsExpiredOne' : 'openJobsExpired', {
										n: unsent
									})}
								</span>
							{:else}
								<span class="block text-sm text-muted">
									{unsent > 0
										? t(messages, unsent === 1 ? 'openJobsUnsentOne' : 'openJobsUnsent', {
												n: unsent
											})
										: t(messages, 'openJobsNone')}
								</span>
							{/if}
						</span>
						<ChevronRight class="size-5 shrink-0 text-muted" />
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
