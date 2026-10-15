export interface StepLike {
	key: string;
	optional: boolean;
}

export interface RoomProgress {
	done: number;
	total: number;
	onPhone: number;
}

export function sequence(steps: readonly StepLike[]): number[] {
	const required: number[] = [];
	const optional: number[] = [];
	steps.forEach((step, i) => (step.optional ? optional : required).push(i));
	return [...required, ...optional];
}

export function takenKeys(done: readonly string[], shotKeys: readonly string[]): Set<string> {
	return new Set([...done, ...shotKeys]);
}

export function firstOpenPos(steps: readonly StepLike[], taken: ReadonlySet<string>): number {
	const order = sequence(steps);
	const pos = order.findIndex((i) => !taken.has(steps[i].key));
	return pos >= 0 ? pos : 0;
}

export function nextOpenPos(
	steps: readonly StepLike[],
	taken: ReadonlySet<string>,
	from: number
): number | null {
	const order = sequence(steps);
	for (let offset = 1; offset < order.length; offset++) {
		const pos = (from + offset) % order.length;
		if (!taken.has(steps[order[pos]].key)) return pos;
	}
	return null;
}

export function roomProgress(
	steps: readonly StepLike[],
	done: readonly string[],
	shotKeys: readonly string[]
): RoomProgress {
	const doneSet = new Set(done);
	const phoneSet = new Set(shotKeys);
	const required = steps.filter((step) => !step.optional);
	return {
		done: required.filter((step) => doneSet.has(step.key)).length,
		total: required.length,
		onPhone: required.filter((step) => !doneSet.has(step.key) && phoneSet.has(step.key)).length
	};
}

export function isRoomComplete(progress: RoomProgress): boolean {
	return progress.total > 0 && progress.done + progress.onPhone >= progress.total;
}
