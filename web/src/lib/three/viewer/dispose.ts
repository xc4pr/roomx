import { Texture, type BufferGeometry, type Material, type Object3D } from 'three';

export function collectResources(root: Object3D): {
	geometries: Set<BufferGeometry>;
	materials: Set<Material>;
	textures: Set<Texture>;
} {
	const geometries = new Set<BufferGeometry>();
	const materials = new Set<Material>();
	const textures = new Set<Texture>();
	root.traverse((object) => {
		const holder = object as Object3D & {
			geometry?: BufferGeometry;
			material?: Material | Material[];
		};
		if (holder.geometry) geometries.add(holder.geometry);
		const list = Array.isArray(holder.material)
			? holder.material
			: holder.material
				? [holder.material]
				: [];
		for (const material of list) {
			materials.add(material);
			for (const value of Object.values(material)) {
				if (value instanceof Texture) textures.add(value);
			}
		}
	});
	return { geometries, materials, textures };
}

export function disposeObject(root: Object3D): void {
	const { geometries, materials, textures } = collectResources(root);
	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
	for (const texture of textures) texture.dispose();
	root.removeFromParent();
}
