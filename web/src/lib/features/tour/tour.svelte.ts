import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { panel } from '#lib/features/board/panel.svelte.ts';
import type { Project } from '#lib/core/schema.ts';
import { locale, t } from '#lib/i18n/index.svelte.ts';
import { deleteProject, loadProject, putPreview, saveProject } from '#lib/state/persistence.ts';
import { store } from '#lib/state/project.svelte.ts';
import { settings, updateSettings } from '#lib/state/settings.svelte.ts';
import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { messages } from './i18n.ts';
import {
	clampStep,
	inSampleContext,
	isInterrupted,
	isLastStep,
	moveStep,
	resumeStep,
	shouldAutostart,
	showTarget,
	stepAt
} from './logic.ts';
import { parseRoute, type ParsedRoute } from './route.ts';
import { buildSampleProject } from './sample.ts';
import type { TourPrepare, TourScreen, TourStep } from './steps.ts';

interface TourState {
	active: boolean;
	step: number;
	sampleId: string | null;
	arriving: boolean;
	busy: boolean;
	focusRequest: number;
}

export const tour = $state<TourState>({
	active: false,
	step: 0,
	sampleId: null,
	arriving: false,
	busy: false,
	focusRequest: 0
});

const READY_TIMEOUT = 5000;
const CLEANUP_TOAST_MS = 9000;
const PREVIEW_WAIT_MS = 2500;

let arrival = 0;
let returnTo: HTMLElement | null = null;

export function currentRoute(): ParsedRoute {
	return parseRoute(page.url.pathname, resolve('/').replace(/\/+$/, ''));
}

function persistStep(): void {
	updateSettings({ tourStep: tour.active ? tour.step : null });
}

function projectPath(screen: Exclude<TourScreen, 'projects'>, id: string): string {
	switch (screen) {
		case '3d':
			return resolve('/p/[id]/3d', { id });
		case 'furnish':
			return resolve('/p/[id]/furnish', { id });
		case 'share':
			return resolve('/p/[id]/share', { id });
		default:
			return resolve('/p/[id]', { id });
	}
}

async function projectReady(id: string): Promise<boolean> {
	const until = Date.now() + READY_TIMEOUT;
	while (Date.now() < until) {
		if (store.project?.id === id) return true;
		await new Promise((done) => setTimeout(done, 50));
	}
	return false;
}

function prepare(kind: TourPrepare | undefined, id: string): void {
	const project = store.project;
	if (!kind || !project || project.id !== id) return;
	if (kind === 'overview') {
		if (id === tour.sampleId) selectRoom(null);
		return;
	}
	const room = project.rooms.find((candidate) => candidate.id === ui.selectedRoomId);
	const target = room ?? project.rooms[0];
	if (!target) return;
	selectRoom(target.id);
	ui.panelTab = kind;
	panel.snap = 'half';
}

async function arrive(step: TourStep): Promise<void> {
	const target = showTarget(step, currentRoute(), tour.sampleId);
	if (!target) return;
	const run = ++arrival;
	tour.arriving = true;
	try {
		if (target.screen === 'projects') {
			await goto(resolve('/'));
			return;
		}
		const id = target.projectId;
		if (!id) return;
		const route = currentRoute();
		if (route.screen !== target.screen || route.projectId !== id) {
			await goto(projectPath(target.screen, id));
		}
		if (run !== arrival || !(await projectReady(id)) || run !== arrival) return;
		prepare(step.prepare, id);
	} catch {
		return;
	} finally {
		if (run === arrival) {
			tour.arriving = false;
			tour.focusRequest += 1;
		}
	}
}

export function showCurrentStep(): void {
	void arrive(stepAt(tour.step));
}

function goToStep(index: number): void {
	tour.step = clampStep(index);
	tour.focusRequest += 1;
	persistStep();
	if (inSampleContext(currentRoute(), tour.sampleId)) void arrive(stepAt(tour.step));
}

export function nextStep(): void {
	if (isLastStep(tour.step)) finishTour();
	else goToStep(moveStep(tour.step, 1));
}

export function previousStep(): void {
	goToStep(moveStep(tour.step, -1));
}

async function storePreview(project: Project): Promise<void> {
	try {
		const { renderProjectPreview } = await import('#lib/three/offscreen.ts');
		await putPreview(project.id, await renderProjectPreview(project));
	} catch {
		return;
	}
}

async function ensureSample(): Promise<string> {
	const known = settings.tourSampleId;
	if (known && (await loadProject(known))) return known;
	const project = buildSampleProject({
		language: locale.language,
		names: { project: t(messages, 'sampleName'), room: t(messages, 'sampleRoom') }
	});
	await Promise.race([
		storePreview(project),
		new Promise((done) => setTimeout(done, PREVIEW_WAIT_MS))
	]);
	await saveProject(project);
	updateSettings({ tourSampleId: project.id });
	return project.id;
}

export async function chooseSample(use: boolean): Promise<void> {
	if (tour.busy) return;
	if (!use) {
		tour.sampleId = null;
		goToStep(1);
		return;
	}
	tour.busy = true;
	try {
		tour.sampleId = await ensureSample();
	} catch {
		tour.sampleId = null;
		toasts.show({ message: t(messages, 'sampleFailed'), kind: 'error' });
	} finally {
		tour.busy = false;
	}
	goToStep(1);
}

async function removeSample(id: string): Promise<void> {
	try {
		if (currentRoute().projectId === id) await goto(resolve('/'));
		await deleteProject(id);
		if (settings.tourSampleId === id) updateSettings({ tourSampleId: null });
	} catch {
		return;
	}
}

function offerCleanup(sampleId: string): void {
	void loadProject(sampleId).then((project) => {
		if (!project) return;
		toasts.show({
			message: t(messages, 'sampleKept'),
			actionLabel: t(messages, 'sampleDelete'),
			onaction: () => void removeSample(sampleId),
			duration: CLEANUP_TOAST_MS
		});
	});
}

function endTour(): void {
	const sampleId = tour.sampleId;
	arrival += 1;
	tour.active = false;
	tour.arriving = false;
	tour.sampleId = null;
	updateSettings({ coachMarksSeen: true, tourStep: null });
	const back = returnTo;
	returnTo = null;
	if (back?.isConnected) back.focus({ preventScroll: true });
	if (sampleId) offerCleanup(sampleId);
}

export function skipTour(): void {
	if (tour.active) endTour();
}

export function finishTour(): void {
	if (tour.active) endTour();
}

export function startTour(options: { resume?: boolean } = {}): void {
	if (tour.active) return;
	const resume = options.resume === true && isInterrupted(settings.tourStep);
	returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	tour.step = resume ? resumeStep(settings.tourStep) : 0;
	tour.sampleId = null;
	tour.active = true;
	tour.focusRequest += 1;
	persistStep();
	const known = settings.tourSampleId;
	if (resume && tour.step > 0 && known) {
		void loadProject(known).then((project) => {
			if (tour.active && project) tour.sampleId = known;
		});
	}
}

export function autostartTour(): void {
	if (tour.active || !shouldAutostart(settings)) return;
	startTour({ resume: isInterrupted(settings.tourStep) });
}
