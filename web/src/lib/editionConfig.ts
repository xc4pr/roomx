import type { Edition } from './edition.ts';

export function resolveEdition(env: Record<string, string | undefined>): Edition {
	if (env.LOCAL_ONLY !== undefined) {
		throw new Error('LOCAL_ONLY was replaced by EDITION=free|pro');
	}
	const chosen = env.EDITION ?? 'pro';
	if (chosen !== 'free' && chosen !== 'pro') {
		throw new Error(`EDITION must be "free" or "pro": ${env.EDITION}`);
	}
	return chosen;
}
