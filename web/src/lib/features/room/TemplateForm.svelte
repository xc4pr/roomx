<script lang="ts">
	import { normalizePolygon } from '#lib/core/geometry.ts';
	import type { Point, Room } from '#lib/core/schema.ts';
	import { ROOM_TEMPLATES } from '#lib/core/templates.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import NumberField from '#lib/ui/NumberField.svelte';
	import { untrack } from 'svelte';
	import { messages, paramLabels, templateNames } from './i18n.ts';
	import TemplateSketch from './TemplateSketch.svelte';
	import {
		TEMPLATE_IDS,
		TEMPLATE_KEYS,
		inferTemplate,
		templateIssue,
		type TemplateId,
		type TemplateParams
	} from './templateInfo.ts';
	import { polygonKey } from './walls.ts';

	interface Props {
		room: Room;
		onapply: (polygon: Point[]) => void;
		onseal: () => void;
	}

	let { room, onapply, onseal }: Props = $props();

	const initial = untrack(() => inferTemplate(room.polygon));
	let selected = $state<TemplateId | undefined>(initial?.id);
	let params = $state<TemplateParams>(initial?.params ?? {});
	let active = $state<string | undefined>();
	let lastKey = untrack(() => polygonKey(room.polygon));

	const issue = $derived(selected ? templateIssue(selected, params) : undefined);
	const invalidKeys = $derived(
		issue ? (issue.kind === 'positive' ? issue.left : [...issue.left, issue.right]) : []
	);

	$effect(() => {
		const key = polygonKey(room.polygon);
		if (key === lastKey) return;
		lastKey = key;
		const found = inferTemplate(room.polygon);
		if (found) {
			selected = found.id;
			params = found.params;
		}
	});

	function pick(id: TemplateId): void {
		selected = id;
		params = { ...ROOM_TEMPLATES[id].defaults };
		push();
		onseal();
	}

	function push(): void {
		if (!selected || templateIssue(selected, params)) return;
		const polygon = normalizePolygon(ROOM_TEMPLATES[selected].build(params));
		lastKey = polygonKey(polygon);
		onapply(polygon);
	}

	function change(key: string, mm: number): void {
		params = { ...params, [key]: mm };
		push();
	}

	function issueText(): string {
		if (!issue) return '';
		if (issue.kind === 'positive') return t(messages, 'issuePositive');
		if (issue.kind === 'less') {
			return t(messages, 'issueLess', { x: issue.left[0], y: issue.right });
		}
		return t(messages, 'issueSum', { x: issue.left.join(' + '), y: issue.right });
	}
</script>

<div class="grid grid-cols-[minmax(0,1fr)] gap-4">
	<div class="grid grid-cols-3 gap-2" role="group" aria-label={t(messages, 'templatePick')}>
		{#each TEMPLATE_IDS as id (id)}
			{@const on = id === selected}
			<button
				type="button"
				aria-pressed={on}
				onclick={() => pick(id)}
				data-testid="template-{id}"
				class="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-xs font-semibold transition duration-(--duration-fast) ease-soft select-none active:scale-95 {on
					? 'border-accent bg-accent-soft text-accent'
					: 'border-border bg-surface hover:bg-surface-2'}"
			>
				<TemplateSketch
					{id}
					params={ROOM_TEMPLATES[id].defaults}
					plain
					class="pointer-events-none h-9 w-14"
					label=""
				/>
				{t(templateNames, id)}
			</button>
		{/each}
	</div>

	{#if selected}
		<TemplateSketch
			id={selected}
			{params}
			invalid={invalidKeys}
			{active}
			label={t(templateNames, selected)}
		/>
		{#if issue}
			<p class="rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">
				{issueText()}
			</p>
		{/if}
		<div
			class="grid grid-cols-[minmax(0,1fr)] gap-3.5"
			role="group"
			aria-label={t(templateNames, selected)}
			onfocusin={(event) =>
				(active = (event.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key)}
			onfocusout={() => (active = undefined)}
		>
			{#each TEMPLATE_KEYS[selected] as key (key)}
				<div data-key={key}>
					<NumberField
						label="{key} · {t(paramLabels, `${selected}_${key}` as keyof typeof paramLabels.de)}"
						value={params[key] ?? 0}
						min={100}
						max={80000}
						decreaseLabel={t(messages, 'less')}
						increaseLabel={t(messages, 'more')}
						oninput={(mm) => change(key, mm)}
						onchange={onseal}
					/>
				</div>
			{/each}
		</div>
	{:else}
		<p class="rounded-md bg-surface-2 px-3 py-3 text-sm text-muted">
			{t(messages, 'templateHint')}
		</p>
	{/if}
</div>
