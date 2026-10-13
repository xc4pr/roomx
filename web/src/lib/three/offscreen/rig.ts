import {
	Box3,
	Color,
	DirectionalLight,
	HemisphereLight,
	Scene,
	Vector3,
	type Object3D
} from 'three';

export interface Rig {
	scene: Scene;
	aim(box: Box3, toCamera: Vector3): void;
	dispose(): void;
}

export const BACKGROUND = '#eef1f4';

export function createRig(
	content: Object3D | null,
	options: { shadows: boolean; background: boolean }
): Rig {
	const scene = new Scene();
	if (options.background) scene.background = new Color(BACKGROUND);
	const hemisphere = new HemisphereLight(0xffffff, 0xcfd3da, 2.1);
	const sun = new DirectionalLight(0xffffff, 2.3);
	sun.castShadow = options.shadows;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.02;
	scene.add(hemisphere, sun, sun.target);
	if (content) scene.add(content);
	return {
		scene,
		aim(box, toCamera) {
			const centre = box.getCenter(new Vector3());
			const radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.5);
			const flat = new Vector3(toCamera.x, 0, toCamera.z);
			if (flat.lengthSq() < 1e-9) flat.set(0, 0, 1);
			flat.normalize().applyAxisAngle(new Vector3(0, 1, 0), 0.6);
			const direction = flat
				.multiplyScalar(0.55)
				.add(new Vector3(0, 1, 0))
				.normalize();
			sun.position.copy(centre).addScaledVector(direction, radius * 2);
			sun.target.position.copy(centre);
			sun.target.updateMatrixWorld();
			const camera = sun.shadow.camera;
			camera.left = -radius;
			camera.right = radius;
			camera.top = radius;
			camera.bottom = -radius;
			camera.near = 0.1;
			camera.far = radius * 4;
			camera.updateProjectionMatrix();
		},
		dispose() {
			sun.dispose();
			scene.remove(sun, hemisphere);
			if (content) scene.remove(content);
		}
	};
}
