export const KEYBOARD_THRESHOLD = 120;
export const REVEAL_MARGIN = 20;

export interface Band {
	top: number;
	bottom: number;
}

export function keyboardInset(
	layoutHeight: number,
	visualHeight: number,
	offsetTop: number
): number {
	const inset = layoutHeight - visualHeight - offsetTop;
	return inset > KEYBOARD_THRESHOLD ? Math.round(inset) : 0;
}

export function revealDelta(target: Band, visible: Band, margin = REVEAL_MARGIN): number {
	if (target.bottom + margin > visible.bottom) {
		return Math.min(target.top - visible.top - margin, target.bottom + margin - visible.bottom);
	}
	if (target.top - margin < visible.top) return target.top - margin - visible.top;
	return 0;
}

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'password', 'number', 'tel', '']);

export function isTextEntry(node: EventTarget | null): node is HTMLElement {
	if (!(node instanceof HTMLElement)) return false;
	if (node instanceof HTMLTextAreaElement) return true;
	if (node instanceof HTMLInputElement) return TEXT_TYPES.has(node.type);
	return node.isContentEditable;
}

function scrollParent(node: HTMLElement): HTMLElement | null {
	for (let parent = node.parentElement; parent; parent = parent.parentElement) {
		if (
			/(auto|scroll)/.test(getComputedStyle(parent).overflowY) &&
			parent.scrollHeight > parent.clientHeight
		) {
			return parent;
		}
	}
	return null;
}

function reveal(node: HTMLElement): void {
	if (!node.isConnected || document.activeElement !== node) return;
	const viewport = window.visualViewport;
	if (!viewport) return;
	const visible: Band = { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height };
	const box = node.getBoundingClientRect();
	const parent = scrollParent(node);
	const frame = parent?.getBoundingClientRect();
	const band: Band = frame
		? { top: Math.max(visible.top, frame.top), bottom: Math.min(visible.bottom, frame.bottom) }
		: visible;
	const delta = revealDelta({ top: box.top, bottom: box.bottom }, band);
	if (delta === 0) return;
	if (parent) parent.scrollBy({ top: delta, behavior: 'smooth' });
}

export function watchKeyboard(): () => void {
	const viewport = window.visualViewport;
	const root = document.documentElement;
	const timers = new Set<ReturnType<typeof setTimeout>>();

	function measure(): void {
		const inset = viewport
			? keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)
			: 0;
		root.style.setProperty('--kb', `${inset}px`);
	}

	function onfocusin(event: FocusEvent): void {
		const target = event.target;
		if (!isTextEntry(target)) return;
		for (const delay of [60, 280, 520]) {
			const timer = setTimeout(() => {
				timers.delete(timer);
				measure();
				reveal(target);
			}, delay);
			timers.add(timer);
		}
	}

	function onresize(): void {
		measure();
		const active = document.activeElement;
		if (isTextEntry(active)) reveal(active);
	}

	measure();
	document.addEventListener('focusin', onfocusin);
	viewport?.addEventListener('resize', onresize);
	viewport?.addEventListener('scroll', measure);
	return () => {
		document.removeEventListener('focusin', onfocusin);
		viewport?.removeEventListener('resize', onresize);
		viewport?.removeEventListener('scroll', measure);
		for (const timer of timers) clearTimeout(timer);
		root.style.removeProperty('--kb');
	};
}
