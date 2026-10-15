import { Box3, OrthographicCamera, Vector3, type Object3D, type WebGLRenderer } from 'three';
import { lookup } from '#lib/catalog/index.ts';
import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { Project } from '#lib/core/schema.ts';
import { buildFurniture } from './furniture/index.ts';
import {
	applyOrtho,
	boxCorners,
	emptyBox,
	farHalfPlane,
	fitOrtho,
	isoDirection,
	isoFitPoints,
	ISO_YAWS,
	TOP_VIEW
} from './offscreen/camera.ts';
import { blobToDataUrl, drawToBlob, plainBlob, withRenderer } from './offscreen/renderer.ts';
import { BACKGROUND, createRig } from './offscreen/rig.ts';
import { buildScene } from './scene.ts';
import type { RoomViews, SceneContent, SceneOptions } from './types.ts';

const LOW_WALLS = 0.12;
const PREVIEW_WALLS = 0.5;
const THUMBNAIL_VIEW = new Vector3(0.78, 0.62, -1).normalize();

const FLAT_OPTIONS: SceneOptions = {
	wallMode: 'up',
	ceiling: false,
	electrical: true,
	lightsOn: false
};

const thumbnails = new Map<string, string>();

function boundsOf(object: Object3D): Box3 {
	object.updateMatrixWorld(true);
	const box = new Box3().setFromObject(object);
	return box.isEmpty() ? emptyBox() : box;
}

function frame(renderer: WebGLRenderer, width: number, height: number, transparent: boolean): void {
	renderer.setSize(width, height, false);
	renderer.setClearColor(BACKGROUND, transparent ? 0 : 1);
	renderer.autoClear = true;
	renderer.clippingPlanes = [];
}

export async function renderRoomViews(
	project: Project,
	roomId: string,
	variantId: string | undefined,
	size: number
): Promise<RoomViews> {
	const content: SceneContent = { project, roomIds: [roomId], variantId };
	return withRenderer(async (renderer) => {
		const low = buildScene(content, { ...FLAT_OPTIONS, wallMode: 'down' }, lookup, LOW_WALLS);
		const high = buildScene(content, FLAT_OPTIONS, lookup, 1);
		const lowRig = createRig(low.root, { shadows: true, background: true });
		const highRig = createRig(high.root, { shadows: true, background: false });
		try {
			const lowBox = boundsOf(low.root);
			const highBox = boundsOf(high.root);
			const centre = highBox.getCenter(new Vector3());
			const camera = new OrthographicCamera();
			frame(renderer, size, size, false);

			lowRig.aim(lowBox, TOP_VIEW);
			applyOrtho(camera, fitOrtho(boxCorners(lowBox), TOP_VIEW, 1));
			renderer.render(lowRig.scene, camera);
			const top = await drawToBlob(renderer, size, size);

			const iso: Blob[] = [];
			for (const yaw of ISO_YAWS) {
				const toCamera = isoDirection(yaw);
				lowRig.aim(lowBox, toCamera);
				highRig.aim(highBox, toCamera);
				applyOrtho(
					camera,
					fitOrtho(isoFitPoints(highBox, toCamera, lowBox.max.y, centre), toCamera, 1)
				);
				renderer.autoClear = true;
				renderer.clippingPlanes = [];
				renderer.render(lowRig.scene, camera);
				renderer.autoClear = false;
				renderer.clippingPlanes = [farHalfPlane(toCamera, centre)];
				renderer.render(highRig.scene, camera);
				renderer.clippingPlanes = [];
				renderer.autoClear = true;
				iso.push(await drawToBlob(renderer, size, size));
			}
			return { top, iso };
		} finally {
			lowRig.dispose();
			highRig.dispose();
			low.dispose();
			high.dispose();
		}
	});
}

export async function renderProjectPreview(project: Project, size = 640): Promise<Blob> {
	const width = Math.max(1, Math.round(size));
	const height = Math.max(1, Math.round(size * 0.75));
	if (project.rooms.length === 0) return plainBlob(width, height, BACKGROUND);
	const content: SceneContent = { project, roomIds: project.rooms.map((room) => room.id) };
	return withRenderer(async (renderer) => {
		const built = buildScene(content, FLAT_OPTIONS, lookup, PREVIEW_WALLS);
		const rig = createRig(built.root, { shadows: true, background: true });
		try {
			const box = boundsOf(built.root);
			const toCamera = isoDirection(45);
			const camera = new OrthographicCamera();
			frame(renderer, width, height, false);
			rig.aim(box, toCamera);
			applyOrtho(camera, fitOrtho(boxCorners(box), toCamera, width / height, 0.08));
			renderer.render(rig.scene, camera);
			return await drawToBlob(renderer, width, height);
		} finally {
			rig.dispose();
			built.dispose();
		}
	});
}

export async function renderCatalogThumbnail(entry: CatalogEntry, size = 160): Promise<string> {
	const key = `${entry.id}|${size}`;
	const cached = thumbnails.get(key);
	if (cached) return cached;
	const url = await withRenderer(async (renderer) => {
		const cachedLate = thumbnails.get(key);
		if (cachedLate) return cachedLate;
		const object = buildFurniture({
			model: entry.model,
			dims: entry.dims,
			color: entry.colors[0],
			...(entry.look ? { look: entry.look } : {})
		});
		const rig = createRig(object, { shadows: false, background: false });
		try {
			const box = boundsOf(object);
			const camera = new OrthographicCamera();
			frame(renderer, size, size, true);
			rig.aim(box, THUMBNAIL_VIEW);
			applyOrtho(camera, fitOrtho(boxCorners(box), THUMBNAIL_VIEW, 1, 0.06));
			renderer.render(rig.scene, camera);
			return await blobToDataUrl(await drawToBlob(renderer, size, size));
		} finally {
			rig.dispose();
		}
	});
	thumbnails.set(key, url);
	return url;
}

export async function exportGlb(content: SceneContent): Promise<Blob> {
	const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
	const built = buildScene(
		content,
		{ wallMode: 'up', ceiling: false, electrical: false, lightsOn: false },
		lookup,
		1
	);
	try {
		const result = await new GLTFExporter().parseAsync(built.root, { binary: true });
		const data =
			result instanceof ArrayBuffer ? result : new TextEncoder().encode(JSON.stringify(result));
		return new Blob([data], { type: 'model/gltf-binary' });
	} finally {
		built.dispose();
	}
}
