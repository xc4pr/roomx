export type TourScreen = 'projects' | 'plan' | '3d' | 'furnish' | 'share';
export type TourPrepare = 'overview' | 'dims' | 'elements' | 'photos';
export type TourExtra = 'sample' | 'shortcuts';
export type TourSide = 'top' | 'bottom' | 'left' | 'right';

export const TOUR_STEP_IDS = [
	'welcome',
	'projects',
	'plan',
	'dims',
	'elements',
	'photos',
	'build',
	'furnish',
	'package',
	'safe'
] as const;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];

export interface TourStep {
	id: TourStepId;
	screen: TourScreen | null;
	anchors: readonly string[];
	prefer: readonly TourSide[];
	prepare?: TourPrepare;
	extra?: TourExtra;
}

const byId = (id: string): string => `[data-testid="${id}"]`;

export const TOUR_STEPS: readonly TourStep[] = [
	{ id: 'welcome', screen: null, anchors: [], prefer: [], extra: 'sample' },
	{
		id: 'projects',
		screen: 'projects',
		anchors: [byId('project-card'), byId('empty-create'), byId('new-project')],
		prefer: ['bottom', 'right', 'top']
	},
	{
		id: 'plan',
		screen: 'plan',
		anchors: [byId('add-room'), byId('empty-add')],
		prefer: ['left', 'top'],
		prepare: 'overview'
	},
	{
		id: 'dims',
		screen: 'plan',
		anchors: [byId('rect-form'), byId('template-form'), byId('free-form'), byId('room-area')],
		prefer: ['left', 'top'],
		prepare: 'dims'
	},
	{
		id: 'elements',
		screen: 'plan',
		anchors: [byId('element-palette'), byId('elements-panel')],
		prefer: ['left', 'top'],
		prepare: 'elements'
	},
	{
		id: 'photos',
		screen: 'plan',
		anchors: [byId('tour-start'), byId('photos-panel')],
		prefer: ['left', 'top'],
		prepare: 'photos'
	},
	{
		id: 'build',
		screen: '3d',
		anchors: [byId('viewer-tools'), byId('build')],
		prefer: ['bottom', 'left']
	},
	{
		id: 'furnish',
		screen: 'furnish',
		anchors: [byId('catalog-fab'), byId('open-catalog')],
		prefer: ['left', 'top', 'bottom']
	},
	{
		id: 'package',
		screen: 'share',
		anchors: [byId('create-package'), byId('package-card')],
		prefer: ['bottom', 'right', 'left']
	},
	{
		id: 'safe',
		screen: 'share',
		anchors: [byId('create-backup'), byId('backup-card')],
		prefer: ['top', 'bottom'],
		extra: 'shortcuts'
	}
];

export const TOUR_TOTAL = TOUR_STEPS.length;

export const TOUR_AVOID: readonly string[] = [
	'[data-app-header]',
	'[data-sidepanel]',
	byId('add-room'),
	byId('catalog-fab'),
	byId('new-project'),
	byId('zoom-controls'),
	byId('toast')
];

export const TOUR_DIALOG_SELECTOR =
	'[role="dialog"]:not([data-tour-card]), [role="alertdialog"], [role="menu"]';
