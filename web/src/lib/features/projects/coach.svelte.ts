import { settings, updateSettings } from '#lib/state/settings.svelte.ts';
import { COACH_TOTAL, isCoachVisible, nextCoachStep } from './coach.ts';

export const coach = $state({ step: 0, replay: false });

export function coachShows(at: number): boolean {
	return isCoachVisible(coach.step, at, settings.coachMarksSeen);
}

export function advanceCoach(from: number): void {
	if (settings.coachMarksSeen) return;
	coach.step = nextCoachStep(coach.step, from);
	if (coach.step >= COACH_TOTAL) updateSettings({ coachMarksSeen: true });
}

export function skipCoach(): void {
	updateSettings({ coachMarksSeen: true });
}

export function restartCoach(): void {
	coach.step = 0;
	coach.replay = true;
	updateSettings({ coachMarksSeen: false });
}
