export type StorageProblem = 'quota' | 'unavailable' | 'blocked' | 'failed';

export class StorageBlockedError extends Error {
	constructor() {
		super('storage blocked by another tab');
		this.name = 'BlockedError';
	}
}

interface ErrorLike {
	name?: unknown;
	message?: unknown;
	inner?: unknown;
	cause?: unknown;
}

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
const BLOCKED_NAMES = new Set(['BlockedError', 'VersionError', 'VersionChangeError']);
const UNAVAILABLE_NAMES = new Set([
	'OpenFailedError',
	'MissingAPIError',
	'SecurityError',
	'InvalidStateError',
	'DatabaseClosedError',
	'UnknownError',
	'NotFoundError'
]);
const QUOTA_MESSAGE = /quota|disk (is )?full|no space left/i;
const UNAVAILABLE_MESSAGE =
	/indexeddb.*(not available|unavailable|disabled|not supported)|did not allow mutations|connection to indexed database server lost|backing store/i;

function chain(error: unknown): ErrorLike[] {
	const found: ErrorLike[] = [];
	let current: unknown = error;
	for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
		const item = current as ErrorLike;
		found.push(item);
		current = item.inner ?? item.cause;
	}
	return found;
}

export function classifyStorageError(error: unknown): StorageProblem {
	const items = chain(error);
	const names = items.map((item) => String(item.name ?? ''));
	const messages = items.map((item) => String(item.message ?? ''));
	if (names.some((name) => QUOTA_NAMES.has(name))) return 'quota';
	if (messages.some((message) => QUOTA_MESSAGE.test(message))) return 'quota';
	if (names.some((name) => BLOCKED_NAMES.has(name))) return 'blocked';
	if (names.some((name) => UNAVAILABLE_NAMES.has(name))) return 'unavailable';
	if (messages.some((message) => UNAVAILABLE_MESSAGE.test(message))) return 'unavailable';
	return 'failed';
}

export type ProblemListener = (problem: StorageProblem | null) => void;

const listeners = new Set<ProblemListener>();
let current: StorageProblem | null = null;

export function currentStorageProblem(): StorageProblem | null {
	return current;
}

export function onStorageProblem(listener: ProblemListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function publish(problem: StorageProblem | null): void {
	if (problem === current) return;
	current = problem;
	for (const listener of listeners) listener(problem);
}

export function reportStorageError(error: unknown): StorageProblem {
	const problem = classifyStorageError(error);
	publish(problem);
	return problem;
}

export function reportStorageRecovered(): void {
	publish(null);
}
