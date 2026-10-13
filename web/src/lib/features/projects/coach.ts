export const COACH_TOTAL = 3;

export function nextCoachStep(step: number, from: number): number {
	return step === from ? Math.min(step + 1, COACH_TOTAL) : step;
}

export function isCoachVisible(step: number, at: number, seen: boolean): boolean {
	return !seen && step === at;
}

export function coachProgress(step: number): string {
	return `${Math.min(step + 1, COACH_TOTAL)}/${COACH_TOTAL}`;
}
