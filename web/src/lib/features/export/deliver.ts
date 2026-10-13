import type { PackageFile } from './package.ts';

export function toFiles(files: readonly PackageFile[]): File[] {
	return files.map((file) => new File([file.data as BlobPart], file.name, { type: file.type }));
}

export function canShareFiles(files: readonly File[]): boolean {
	if (typeof navigator === 'undefined') return false;
	if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function')
		return false;
	try {
		return navigator.canShare({ files: [...files] });
	} catch {
		return false;
	}
}

export async function shareFiles(
	files: readonly File[],
	title: string
): Promise<'shared' | 'cancelled'> {
	try {
		await navigator.share({ files: [...files], title });
		return 'shared';
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		throw error;
	}
}

export function downloadBlob(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadFiles(files: readonly File[], pause = 400): Promise<void> {
	for (let index = 0; index < files.length; index++) {
		if (index > 0) await new Promise((resolve) => setTimeout(resolve, pause));
		downloadBlob(files[index].name, files[index]);
	}
}
