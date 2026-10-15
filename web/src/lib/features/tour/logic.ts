import type { ParsedRoute } from './route.ts';
import { TOUR_STEPS, TOUR_TOTAL, type TourStep, type TourStepId } from './steps.ts';

export function clampStep(index: number): number {
	if (!Number.isFinite(index)) return 0;
	return Math.max(0, Math.min(TOUR_TOTAL - 1, Math.trunc(index)));
}

export function stepAt(index: number): TourStep {
	return TOUR_STEPS[clampStep(index)];
}

export function moveStep(index: number, delta: 1 | -1): number {
	return clampStep(index + delta);
}

export function isFirstStep(index: number): boolean {
	return clampStep(index) === 0;
}

export function isLastStep(index: number): boolean {
	return clampStep(index) === TOUR_TOTAL - 1;
}

export function progressLabel(index: number): string {
	return `${clampStep(index) + 1}/${TOUR_TOTAL}`;
}

export interface TourSettings {
	coachMarksSeen: boolean;
	tourStep: number | null;
}

export function shouldAutostart(settings: TourSettings): boolean {
	return !settings.coachMarksSeen || isInterrupted(settings.tourStep);
}

export function isInterrupted(tourStep: number | null): tourStep is number {
	return typeof tourStep === 'number' && Number.isFinite(tourStep) && tourStep >= 0;
}

export function resumeStep(tourStep: number | null): number {
	return isInterrupted(tourStep) ? clampStep(tourStep) : 0;
}

export function inSampleContext(route: ParsedRoute, sampleId: string | null): boolean {
	if (!sampleId) return false;
	if (route.screen === 'projects' || route.screen === 'settings') return true;
	return route.projectId === sampleId;
}

export interface ShowTarget {
	screen: NonNullable<TourStep['screen']>;
	projectId: string | null;
}

export function showTarget(
	step: TourStep,
	route: ParsedRoute,
	sampleId: string | null
): ShowTarget | null {
	if (!step.screen) return null;
	if (step.screen === 'projects') {
		return route.screen === 'projects' ? null : { screen: 'projects', projectId: null };
	}
	const projectId = route.projectId ?? sampleId;
	if (!projectId) return null;
	if (route.screen === step.screen && route.projectId === projectId && !step.prepare) return null;
	return { screen: step.screen, projectId };
}

export function anchorExpected(step: TourStep, route: ParsedRoute, arriving: boolean): boolean {
	if (step.anchors.length === 0) return false;
	if (arriving) return true;
	if (!step.screen) return false;
	if (step.screen === 'projects') return route.screen === 'projects';
	return route.screen === step.screen;
}

export type TitleKey = `title_${TourStepId}` | 'title_safe_local';
export type TextKey = `text_${TourStepId}` | 'text_safe_local' | 'text_safe_phone';

export function titleKey(id: TourStepId, localOnly: boolean): TitleKey {
	return localOnly && id === 'safe' ? 'title_safe_local' : `title_${id}`;
}

export function textKey(id: TourStepId, localOnly: boolean, keyboard: boolean): TextKey {
	if (id !== 'safe') return `text_${id}`;
	if (localOnly) return 'text_safe_local';
	return keyboard ? 'text_safe' : 'text_safe_phone';
}
