import type { ModelType } from '#lib/core/schema.ts';

export type Shape =
	| { t: 'rect'; x: number; y: number; w: number; h: number; r: number }
	| { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
	| { t: 'line'; x1: number; y1: number; x2: number; y2: number };

const ROUND: readonly ModelType[] = [
	'roundTable',
	'roundRug',
	'plant',
	'hangingPlant',
	'stool',
	'pendantLamp',
	'floorLamp',
	'tableLamp',
	'officeChair',
	'vase',
	'basket',
	'clock'
];

export function isRound(model: ModelType | undefined): boolean {
	return model !== undefined && ROUND.includes(model);
}

function rect(x: number, y: number, w: number, h: number, r = 0): Shape {
	return { t: 'rect', x, y, w, h, r };
}

function line(x1: number, y1: number, x2: number, y2: number): Shape {
	return { t: 'line', x1, y1, x2, y2 };
}

export function symbolShapes(model: ModelType | undefined, w: number, d: number): Shape[] {
	const hw = w / 2;
	const hd = d / 2;
	switch (model) {
		case 'bed': {
			const pw = w * 0.4;
			const ph = Math.min(d * 0.16, 260);
			const gap = w * 0.06;
			const top = -hd + d * 0.04;
			return [
				rect(-gap / 2 - pw, top, pw, ph, ph * 0.3),
				rect(gap / 2, top, pw, ph, ph * 0.3),
				line(-hw, -hd + d * 0.3, hw, -hd + d * 0.3)
			];
		}
		case 'sofa':
		case 'cornerSofa':
		case 'armchair': {
			const arm = Math.min(w * 0.1, 160);
			const back = Math.min(d * 0.25, 220);
			return [
				rect(-hw, -hd, w, back, back * 0.3),
				rect(-hw, -hd + back * 0.6, arm, d - back * 0.6, arm * 0.3),
				rect(hw - arm, -hd + back * 0.6, arm, d - back * 0.6, arm * 0.3)
			];
		}
		case 'chair': {
			const back = d * 0.2;
			return [
				rect(-hw * 0.9, -hd, w * 0.9, back, back * 0.3),
				rect(-hw * 0.7, -hd + back * 1.3, w * 0.7, d * 0.55, 20)
			];
		}
		case 'desk':
		case 'table':
			return [rect(-hw + w * 0.04, -hd + d * 0.06, w * 0.92, d * 0.88, 20)];
		case 'roundTable':
		case 'roundRug':
			return [{ t: 'ellipse', cx: 0, cy: 0, rx: hw * 0.82, ry: hd * 0.82 }];
		case 'wardrobe':
		case 'dresser':
		case 'sideboard':
			return [line(0, -hd, 0, hd), line(-hw, hd - d * 0.12, hw, hd - d * 0.12)];
		case 'shelf':
		case 'cubeShelf':
		case 'wallShelf': {
			const count = Math.max(2, Math.min(5, Math.round(w / 350)));
			return Array.from({ length: count - 1 }, (_, i) => {
				const x = -hw + (w * (i + 1)) / count;
				return line(x, -hd, x, hd);
			});
		}
		case 'rug':
			return [rect(-hw + w * 0.05, -hd + d * 0.05, w * 0.9, d * 0.9, 0)];
		case 'plant':
		case 'hangingPlant':
			return [
				{ t: 'ellipse', cx: 0, cy: 0, rx: hw * 0.55, ry: hd * 0.55 },
				{ t: 'ellipse', cx: 0, cy: 0, rx: hw * 0.2, ry: hd * 0.2 }
			];
		case 'monitor':
		case 'tv':
			return [line(-hw, hd * 0.2, hw, hd * 0.2)];
		case 'picture':
		case 'mirror':
			return [rect(-hw * 0.8, -hd, w * 0.8, d, 0)];
		case 'curtain': {
			const count = Math.max(3, Math.round(w / 150));
			return Array.from({ length: count - 1 }, (_, i) => {
				const x = -hw + (w * (i + 1)) / count;
				return line(x, -hd, x, hd);
			});
		}
		case 'nightstand':
			return [rect(-hw * 0.7, -hd * 0.7, w * 0.7, d * 0.7, 10)];
		default:
			return [];
	}
}
