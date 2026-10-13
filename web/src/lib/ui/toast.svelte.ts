export type ToastKind = 'info' | 'success' | 'error';

export interface ToastInput {
	message: string;
	kind?: ToastKind;
	actionLabel?: string;
	onaction?: () => void;
	duration?: number;
	sticky?: boolean;
	id?: string;
}

export interface ToastItem {
	id: string;
	message: string;
	kind: ToastKind;
	actionLabel?: string;
	onaction?: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

class ToastStore {
	items = $state<ToastItem[]>([]);

	show(input: ToastInput): string {
		const id = input.id ?? `toast-${++counter}`;
		const item: ToastItem = {
			id,
			message: input.message,
			kind: input.kind ?? 'info',
			actionLabel: input.actionLabel,
			onaction: input.onaction
		};
		const index = this.items.findIndex((existing) => existing.id === id);
		if (index >= 0) this.items[index] = item;
		else this.items = [...this.items, item].slice(-4);
		this.clearTimer(id);
		if (!input.sticky) {
			const duration = input.duration ?? (input.actionLabel ? 8000 : 4000);
			timers.set(
				id,
				setTimeout(() => this.dismiss(id), duration)
			);
		}
		return id;
	}

	dismiss(id: string): void {
		this.clearTimer(id);
		this.items = this.items.filter((item) => item.id !== id);
	}

	private clearTimer(id: string): void {
		const timer = timers.get(id);
		if (timer !== undefined) clearTimeout(timer);
		timers.delete(id);
	}
}

export const toasts = new ToastStore();
