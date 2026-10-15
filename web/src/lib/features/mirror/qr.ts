export function qrPath(modules: readonly (readonly boolean[])[]): string {
	let path = '';
	for (let y = 0; y < modules.length; y++) {
		const row = modules[y] ?? [];
		let x = 0;
		while (x < row.length) {
			if (!row[x]) {
				x++;
				continue;
			}
			const start = x;
			while (x < row.length && row[x]) x++;
			path += `M${start} ${y}h${x - start}v1h${start - x}z`;
		}
	}
	return path;
}
