import { BackSide, DoubleSide, FrontSide, MeshStandardMaterial } from 'three';

export interface MaterialSpec {
	color: string;
	opacity?: number;
	emissive?: string;
	emissiveIntensity?: number;
	roughness?: number;
	metalness?: number;
	side?: 'back' | 'double';
	push?: boolean;
}

export const PALETTE = {
	wall: '#efebe3',
	wallOuter: '#d9d4ca',
	wallTop: '#f8f6f1',
	floor: '#cdb899',
	base: '#bdb6aa',
	frame: '#f1efe9',
	door: '#d7b68c',
	handle: '#5a5f66',
	glass: '#a9d0ea',
	builtin: '#e3ddd1',
	builtinCarcass: '#8d877d',
	obstacle: '#c4beb3',
	radiator: '#f6f5f1',
	plate: '#fbfaf6',
	electric: '#e5b400',
	dark: '#2b2e33',
	lampShade: '#fff4d9',
	lampGlow: '#ffb45a',
	usb: '#2b7bd0',
	ceramic: '#f4f5f2',
	chrome: '#c4c8cc',
	worktop: '#8c867b',
	brick: '#b9ab98',
	tile: '#e8e4da',
	stoveBlack: '#26282c',
	appliance: '#33363b',
	steel: '#b4b8bc',
	slab: '#c9c6bf',
	slabEdge: '#a9a59c',
	paving: '#b9b4aa',
	paveJoint: '#8f8a80',
	lawn: '#8db36a',
	soil: '#7a6850',
	railing: '#4a4f55',
	railingGlass: '#bfdcec',
	cover: '#e9e6df',
	alu: '#d2d5d8'
} as const;

export class MaterialSet {
	readonly #cache = new Map<string, MeshStandardMaterial>();

	get(spec: MaterialSpec): MeshStandardMaterial {
		const key = [
			spec.color,
			spec.opacity ?? 1,
			spec.emissive ?? '',
			spec.emissiveIntensity ?? 0,
			spec.roughness ?? 0.9,
			spec.metalness ?? 0,
			spec.side ?? '',
			spec.push ? 'push' : ''
		].join('|');
		const cached = this.#cache.get(key);
		if (cached) return cached;
		const opacity = spec.opacity ?? 1;
		const material = new MeshStandardMaterial({
			color: spec.color,
			roughness: spec.roughness ?? 0.9,
			metalness: spec.metalness ?? 0,
			transparent: opacity < 1,
			opacity,
			depthWrite: opacity >= 1,
			side: spec.side === 'double' ? DoubleSide : spec.side === 'back' ? BackSide : FrontSide,
			polygonOffset: spec.push === true,
			polygonOffsetFactor: spec.push ? 1 : 0,
			polygonOffsetUnits: spec.push ? 1 : 0
		});
		if (spec.emissive) {
			material.emissive.set(spec.emissive);
			material.emissiveIntensity = spec.emissiveIntensity ?? 1;
		}
		this.#cache.set(key, material);
		return material;
	}
}
