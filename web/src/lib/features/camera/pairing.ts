import { goto } from '$app/navigation';
import { parsePair, type PairError } from '#lib/mirror/job.ts';
import { saveCameraPart } from '#lib/mirror/jobs.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import { messages } from './i18n.ts';

export type PairOutcome = { jobId: string } | { error: PairError };

const MARKER = '#pair=';

export async function consumePairFragment(
	hash: string = location.hash
): Promise<PairOutcome | null> {
	if (!hash.startsWith(MARKER)) return null;
	const parsed = parsePair(hash);
	let outcome: PairOutcome;
	if (!parsed.ok) {
		outcome = { error: parsed.error };
	} else {
		try {
			const job = await saveCameraPart(parsed.token, parsed.payload);
			outcome = { jobId: job.id };
		} catch {
			outcome = { error: 'invalid' };
		}
	}
	try {
		await goto(location.pathname + location.search, {
			replace: true,
			reset: false
		});
	} catch {
		location.hash = '';
	}
	return outcome;
}

const ERROR_KEYS = {
	format: 'pairFormat',
	tooLarge: 'pairTooLarge',
	invalid: 'pairInvalid',
	expired: 'pairExpired'
} as const satisfies Record<PairError, keyof (typeof messages)['de']>;

export function pairErrorMessage(error: PairError): string {
	return t(messages, ERROR_KEYS[error]);
}
