import { afterEach, describe, expect, it } from 'vitest';
import {
	classifyStorageError,
	currentStorageProblem,
	onStorageProblem,
	reportStorageError,
	reportStorageRecovered,
	StorageBlockedError
} from './storageErrors.ts';

function named(name: string, message = '', inner?: unknown): Error {
	const error = new Error(message);
	error.name = name;
	(error as Error & { inner?: unknown }).inner = inner;
	return error;
}

afterEach(() => reportStorageRecovered());

describe('classifyStorageError', () => {
	it('recognises a full disk in every browser flavour', () => {
		expect(classifyStorageError(new DOMException('full', 'QuotaExceededError'))).toBe('quota');
		expect(classifyStorageError(named('NS_ERROR_DOM_QUOTA_REACHED'))).toBe('quota');
		expect(classifyStorageError(named('UnknownError', 'The quota has been exceeded.'))).toBe(
			'quota'
		);
	});

	it('sees through Dexie wrappers', () => {
		const wrapped = named(
			'AbortError',
			'Transaction aborted',
			new DOMException('x', 'QuotaExceededError')
		);
		expect(classifyStorageError(wrapped)).toBe('quota');
	});

	it('recognises unavailable storage', () => {
		expect(classifyStorageError(named('OpenFailedError'))).toBe('unavailable');
		expect(classifyStorageError(named('MissingAPIError', 'IndexedDB API missing'))).toBe(
			'unavailable'
		);
		expect(classifyStorageError(named('InvalidStateError'))).toBe('unavailable');
		expect(
			classifyStorageError(
				named(
					'Error',
					'A mutation operation was attempted on a database that did not allow mutations.'
				)
			)
		).toBe('unavailable');
		expect(classifyStorageError(new DOMException('no', 'SecurityError'))).toBe('unavailable');
	});

	it('recognises a database blocked by another tab', () => {
		expect(classifyStorageError(new StorageBlockedError())).toBe('blocked');
		expect(classifyStorageError(named('VersionError'))).toBe('blocked');
	});

	it('falls back to a generic failure', () => {
		expect(classifyStorageError(new Error('boom'))).toBe('failed');
		expect(classifyStorageError('text')).toBe('failed');
		expect(classifyStorageError(null)).toBe('failed');
	});
});

describe('reporting', () => {
	it('keeps the problem until a save works again and tells listeners once', () => {
		const seen: (string | null)[] = [];
		const stop = onStorageProblem((problem) => seen.push(problem));
		reportStorageError(new DOMException('full', 'QuotaExceededError'));
		reportStorageError(new DOMException('full', 'QuotaExceededError'));
		expect(currentStorageProblem()).toBe('quota');
		reportStorageRecovered();
		reportStorageRecovered();
		stop();
		expect(seen).toEqual(['quota', null]);
	});
});
