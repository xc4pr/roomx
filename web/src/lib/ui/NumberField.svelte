<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { lengthValue, parseLength } from '#lib/core/units.ts';
	import { locale } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { STEPPER_REPEAT_AFTER_MS, clampMm, repeatDelay, stepValue } from './numberLogic.ts';

	interface Props {
		value: number;
		label?: string;
		hint?: string;
		min?: number;
		max?: number;
		step?: number;
		stepper?: boolean;
		disabled?: boolean;
		id?: string;
		class?: string;
		oninput?: (mm: number) => void;
		onchange?: (mm: number) => void;
		decreaseLabel?: string;
		increaseLabel?: string;
		'data-testid'?: string;
	}

	let {
		value,
		label,
		hint,
		min,
		max,
		step = 10,
		stepper = true,
		disabled = false,
		id,
		class: extra = '',
		oninput,
		onchange,
		decreaseLabel = '−',
		increaseLabel = '+',
		'data-testid': testid
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `nf-${uid}`);

	let draft = $state<number | null>(null);
	let text = $state<string | null>(null);
	let input: HTMLInputElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let startValue = 0;
	let startedAt = 0;

	const shown = $derived(draft ?? value);
	const display = $derived(text ?? lengthValue(shown, settings.unit, locale.language));

	function commit(): void {
		if (text === null) return;
		const parsed = parseLength(text, settings.unit);
		text = null;
		if (parsed === undefined) return;
		const next = clampMm(parsed, min, max);
		if (next !== value) {
			oninput?.(next);
			onchange?.(next);
		}
	}

	function onInputText(event: Event & { currentTarget: HTMLInputElement }): void {
		text = event.currentTarget.value;
		const parsed = parseLength(text, settings.unit);
		if (parsed !== undefined) oninput?.(clampMm(parsed, min, max));
	}

	function apply(direction: 1 | -1, heldMs: number): void {
		const next = stepValue(draft ?? value, direction, step, heldMs, min, max);
		draft = next;
		oninput?.(next);
	}

	function startHold(direction: 1 | -1, event: PointerEvent): void {
		if (disabled) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		commit();
		startValue = value;
		startedAt = performance.now();
		apply(direction, 0);
		const tick = () => {
			const held = performance.now() - startedAt;
			apply(direction, held);
			timer = setTimeout(tick, repeatDelay(held));
		};
		timer = setTimeout(tick, STEPPER_REPEAT_AFTER_MS);
	}

	function endHold(): void {
		if (timer === undefined) return;
		clearTimeout(timer);
		timer = undefined;
		const final = draft;
		draft = null;
		if (final !== null && final !== startValue) onchange?.(final);
	}

	function keyStep(direction: 1 | -1): void {
		commit();
		const next = stepValue(value, direction, step, 0, min, max);
		if (next === value) return;
		oninput?.(next);
		onchange?.(next);
	}

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			commit();
			input?.select();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			keyStep(1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			keyStep(-1);
		}
	}

	const stepButton =
		'flex size-11 shrink-0 touch-none select-none items-center justify-center rounded-full bg-surface-2 text-text transition duration-(--duration-fast) ease-soft [-webkit-touch-callout:none] hover:bg-border active:scale-90 active:bg-accent-soft active:text-accent disabled:pointer-events-none disabled:opacity-40';
</script>

<div class="flex flex-col gap-1.5 {extra}">
	{#if label}
		<label for={inputId} class="px-1 text-sm font-semibold text-muted">{label}</label>
	{/if}
	<div class="flex items-center gap-1.5">
		{#if stepper}
			<button
				type="button"
				class={stepButton}
				aria-label={decreaseLabel}
				disabled={disabled || (min !== undefined && shown <= min)}
				onpointerdown={(event) => startHold(-1, event)}
				onpointerup={endHold}
				onpointercancel={endHold}
				onlostpointercapture={endHold}
				oncontextmenu={(event) => event.preventDefault()}
				onclick={(event) => event.detail === 0 && keyStep(-1)}
			>
				<Minus class="size-5" />
			</button>
		{/if}
		<div
			class="flex min-h-12 min-w-0 grow items-center gap-1 rounded-md border border-border bg-surface px-3 transition duration-(--duration-fast) ease-soft focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft {disabled
				? 'opacity-50'
				: ''}"
		>
			<input
				bind:this={input}
				id={inputId}
				type="text"
				inputmode="decimal"
				autocomplete="off"
				{disabled}
				value={display}
				class="min-w-0 grow bg-transparent py-2.5 text-end text-base font-semibold tabular-nums outline-none"
				oninput={onInputText}
				onfocus={() => {
					text = lengthValue(shown, settings.unit, locale.language);
					requestAnimationFrame(() => input?.select());
				}}
				onblur={commit}
				onkeydown={onKey}
				data-testid={testid}
			/>
			<span class="text-sm font-medium text-muted">{settings.unit}</span>
		</div>
		{#if stepper}
			<button
				type="button"
				class={stepButton}
				aria-label={increaseLabel}
				disabled={disabled || (max !== undefined && shown >= max)}
				onpointerdown={(event) => startHold(1, event)}
				onpointerup={endHold}
				onpointercancel={endHold}
				onlostpointercapture={endHold}
				oncontextmenu={(event) => event.preventDefault()}
				onclick={(event) => event.detail === 0 && keyStep(1)}
			>
				<Plus class="size-5" />
			</button>
		{/if}
	</div>
	{#if hint}
		<p class="px-1 text-sm text-muted">{hint}</p>
	{/if}
</div>
