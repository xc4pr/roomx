import { describe, expect, it } from 'vitest';
import {
	anchorExpected,
	clampStep,
	inSampleContext,
	isFirstStep,
	isInterrupted,
	isLastStep,
	moveStep,
	progressLabel,
	resumeStep,
	shouldAutostart,
	showTarget,
	stepAt
} from './logic.ts';
import type { ParsedRoute } from './route.ts';
import { TOUR_STEPS, TOUR_TOTAL } from './steps.ts';

const projects: ParsedRoute = { screen: 'projects', projectId: null };
const settings: ParsedRoute = { screen: 'settings', projectId: null };
const plan = (id: string): ParsedRoute => ({ screen: 'plan', projectId: id });
const furnish = (id: string): ParsedRoute => ({ screen: 'furnish', projectId: id });
const step = (id: string) => TOUR_STEPS.find((candidate) => candidate.id === id)!;

describe('step order', () => {
	it('has ten steps starting with the welcome card', () => {
		expect(TOUR_TOTAL).toBe(10);
		expect(stepAt(0).id).toBe('welcome');
		expect(stepAt(TOUR_TOTAL - 1).id).toBe('safe');
	});

	it('clamps and moves within bounds', () => {
		expect(clampStep(-3)).toBe(0);
		expect(clampStep(99)).toBe(TOUR_TOTAL - 1);
		expect(clampStep(Number.NaN)).toBe(0);
		expect(clampStep(2.7)).toBe(2);
		expect(moveStep(0, -1)).toBe(0);
		expect(moveStep(3, 1)).toBe(4);
		expect(moveStep(TOUR_TOTAL - 1, 1)).toBe(TOUR_TOTAL - 1);
		expect(isFirstStep(0)).toBe(true);
		expect(isLastStep(TOUR_TOTAL - 1)).toBe(true);
		expect(isLastStep(2)).toBe(false);
	});

	it('formats progress as n/total', () => {
		expect(progressLabel(0)).toBe('1/10');
		expect(progressLabel(2)).toBe('3/10');
		expect(progressLabel(40)).toBe('10/10');
	});
});

describe('autostart and resume', () => {
	it('starts on first open and when interrupted', () => {
		expect(shouldAutostart({ tourSeen: false, tourStep: null })).toBe(true);
		expect(shouldAutostart({ tourSeen: true, tourStep: null })).toBe(false);
		expect(shouldAutostart({ tourSeen: true, tourStep: 4 })).toBe(true);
		expect(shouldAutostart({ tourSeen: true, tourStep: 0 })).toBe(true);
	});

	it('resumes at the stored step', () => {
		expect(isInterrupted(null)).toBe(false);
		expect(isInterrupted(5)).toBe(true);
		expect(resumeStep(null)).toBe(0);
		expect(resumeStep(6)).toBe(6);
		expect(resumeStep(500)).toBe(TOUR_TOTAL - 1);
		expect(resumeStep(Number.NaN)).toBe(0);
	});
});

describe('sample context', () => {
	it('follows the tour only around the sample project', () => {
		expect(inSampleContext(projects, null)).toBe(false);
		expect(inSampleContext(projects, 's')).toBe(true);
		expect(inSampleContext(settings, 's')).toBe(true);
		expect(inSampleContext(plan('s'), 's')).toBe(true);
		expect(inSampleContext(plan('other'), 's')).toBe(false);
	});
});

describe('showTarget', () => {
	it('offers nothing for the welcome card', () => {
		expect(showTarget(step('welcome'), projects, 's')).toBeNull();
	});

	it('leads back to the projects list from elsewhere', () => {
		expect(showTarget(step('projects'), projects, null)).toBeNull();
		expect(showTarget(step('projects'), plan('x'), null)).toEqual({
			screen: 'projects',
			projectId: null
		});
	});

	it('prefers the open project over the sample', () => {
		expect(showTarget(step('furnish'), plan('mine'), 's')).toEqual({
			screen: 'furnish',
			projectId: 'mine'
		});
		expect(showTarget(step('furnish'), projects, 's')).toEqual({
			screen: 'furnish',
			projectId: 's'
		});
	});

	it('offers nothing without a project', () => {
		expect(showTarget(step('furnish'), projects, null)).toBeNull();
	});

	it('stays quiet when the screen already fits, unless the step prepares the panel', () => {
		expect(showTarget(step('furnish'), furnish('x'), null)).toBeNull();
		expect(showTarget(step('dims'), plan('x'), null)).toEqual({ screen: 'plan', projectId: 'x' });
	});
});

describe('anchorExpected', () => {
	it('never expects an anchor on cards without one', () => {
		expect(anchorExpected(step('welcome'), projects, true)).toBe(false);
	});

	it('expects one while arriving or on the matching screen', () => {
		expect(anchorExpected(step('plan'), projects, true)).toBe(true);
		expect(anchorExpected(step('plan'), plan('x'), false)).toBe(true);
		expect(anchorExpected(step('plan'), projects, false)).toBe(false);
		expect(anchorExpected(step('projects'), projects, false)).toBe(true);
		expect(anchorExpected(step('furnish'), plan('x'), false)).toBe(false);
	});
});
