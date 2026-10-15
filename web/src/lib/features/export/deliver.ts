import { zipSync, type Zippable } from 'fflate';
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

export function zipPackage(files: readonly PackageFile[]): Blob {
	const entries: Zippable = {};
	for (const file of files) {
		entries[file.name] = [file.data, { level: file.type === 'application/pdf' ? 0 : 6 }];
	}
	return new Blob([zipSync(entries) as BlobPart], { type: 'application/zip' });
}

export async function copyText(text: string): Promise<boolean> {
	try {
		if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
			return false;
		}
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export function selectNode(node: Node): void {
	const selection = typeof window === 'undefined' ? null : window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(node);
	selection.removeAllRanges();
	selection.addRange(range);
}

export function copySelection(): boolean {
	try {
		return document.execCommand('copy');
	} catch {
		return false;
	}
}
