<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import House from '@lucide/svelte/icons/house';
	import { resolve } from '$app/paths';
	import { formatDate } from '#lib/core/units.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { getPreview, type ProjectSummary } from '#lib/state/persistence.ts';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { longpress, type LongPressPoint } from '#lib/ui/longpress.ts';
	import { messages } from './i18n.ts';

	interface Props {
		project: ProjectSummary;
		onmenu: (project: ProjectSummary, point: LongPressPoint) => void;
	}

	// WebKit reports an error when a blob URL is revoked while its image is still loading.
	const REVOKE_DELAY_MS = 2000;

	let { project, onmenu }: Props = $props();

	let previewUrl = $state<string | null>(null);

	$effect(() => {
		const id = project.id;
		void project.updatedAt;
		let url: string | null = null;
		let cancelled = false;
		void getPreview(id).then((blob) => {
			if (cancelled || !blob) {
				previewUrl = null;
				return;
			}
			url = URL.createObjectURL(blob);
			previewUrl = url;
		});
		return () => {
			cancelled = true;
			const stale = url;
			if (stale) setTimeout(() => URL.revokeObjectURL(stale), REVOKE_DELAY_MS);
		};
	});

	const rooms = $derived(
		project.roomCount === 0
			? t(messages, 'roomsNone')
			: project.roomCount === 1
				? t(messages, 'roomsOne')
				: t(messages, 'roomsMany', { n: project.roomCount })
	);
</script>

<div
	class="group relative"
	use:longpress={{ onlongpress: (point) => onmenu(project, point) }}
	data-testid="project-card"
>
	<a
		href={resolve('/p/[id]', { id: project.id })}
		aria-label="{t(messages, 'openProject')}: {project.name}"
		class="block overflow-hidden rounded-lg border border-border bg-surface shadow-soft transition duration-(--duration-base) ease-soft select-none [-webkit-touch-callout:none] hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]"
	>
		<div class="relative aspect-4/3 overflow-hidden bg-surface-2">
			{#if previewUrl}
				<img
					src={previewUrl}
					alt=""
					draggable="false"
					class="size-full object-contain p-3 transition-transform duration-(--duration-slow) ease-soft group-hover:scale-[1.03]"
				/>
			{:else}
				<div class="flex size-full items-center justify-center text-muted/50">
					<House class="size-12" strokeWidth={1.5} />
				</div>
			{/if}
		</div>
		<div class="px-4 pt-3 pb-4">
			<p class="truncate text-lg font-bold tracking-tight">{project.name}</p>
			<p class="mt-0.5 text-sm text-muted">
				{rooms} · {formatDate(project.updatedAt, locale.language)}
			</p>
		</div>
	</a>
	<div class="absolute top-2 right-2">
		<IconButton
			icon={Ellipsis}
			label={t(messages, 'more')}
			variant="secondary"
			data-testid="project-menu"
			onclick={(event) => {
				const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
				onmenu(project, { x: rect.right - 208, y: rect.bottom + 6 });
			}}
		/>
	</div>
</div>
