export type ContextPhase = 'ok' | 'lost' | 'failed';

export interface ContextState {
	phase: ContextPhase;
	lostAt: number | null;
	recent: readonly number[];
}

export const RESTORE_TIMEOUT_MS = 6000;
export const LOSS_WINDOW_MS = 60_000;
export const REPEATED_LOSSES = 2;

export function initialContext(): ContextState {
	return { phase: 'ok', lostAt: null, recent: [] };
}

export function contextLost(state: ContextState, now: number): ContextState {
	const recent = [...state.recent.filter((at) => now - at < LOSS_WINDOW_MS), now];
	if (state.phase !== 'ok') return { ...state, recent };
	return { phase: 'lost', lostAt: now, recent };
}

export function contextRestored(state: ContextState): ContextState {
	return { ...state, phase: 'ok', lostAt: null };
}

export function contextTimeout(state: ContextState, now: number): ContextState {
	if (state.phase !== 'lost' || state.lostAt === null) return state;
	if (now - state.lostAt < RESTORE_TIMEOUT_MS) return state;
	return { ...state, phase: 'failed' };
}

export function remainingMs(state: ContextState, now: number): number {
	if (state.phase !== 'lost' || state.lostAt === null) return 0;
	return Math.max(0, RESTORE_TIMEOUT_MS - (now - state.lostAt));
}

export function lossIsRepeating(state: ContextState, now: number): boolean {
	return state.recent.filter((at) => now - at < LOSS_WINDOW_MS).length >= REPEATED_LOSSES;
}
