export interface LongPressPoint {
	x: number;
	y: number;
}

export interface LongPressOptions {
	onlongpress: (point: LongPressPoint, event: Event) => void;
	delay?: number;
	tolerance?: number;
	disabled?: boolean;
}

export function longpress(node: HTMLElement, initial: LongPressOptions) {
	let options = initial;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let origin: LongPressPoint = { x: 0, y: 0 };
	let fired = false;

	function cancel(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function onpointerdown(event: PointerEvent): void {
		if (options.disabled || event.button > 0) return;
		fired = false;
		origin = { x: event.clientX, y: event.clientY };
		cancel();
		timer = setTimeout(() => {
			timer = undefined;
			fired = true;
			options.onlongpress(origin, event);
		}, options.delay ?? 450);
	}

	function onpointermove(event: PointerEvent): void {
		if (timer === undefined) return;
		const tolerance = options.tolerance ?? 10;
		if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > tolerance) cancel();
	}

	function onclick(event: MouseEvent): void {
		if (!fired) return;
		fired = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function oncontextmenu(event: MouseEvent): void {
		if (options.disabled) return;
		event.preventDefault();
		if (fired) return;
		cancel();
		options.onlongpress({ x: event.clientX, y: event.clientY }, event);
	}

	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('click', onclick, true);
	node.addEventListener('contextmenu', oncontextmenu);
	node.style.setProperty('-webkit-touch-callout', 'none');

	return {
		update(next: LongPressOptions) {
			options = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('click', onclick, true);
			node.removeEventListener('contextmenu', oncontextmenu);
		}
	};
}
