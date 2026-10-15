import { shotFileName, withShotComment } from '#lib/mirror/files.ts';
import type { Shot } from '#lib/mirror/types.ts';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export interface ShareNavigator {
	canShare?: (data: ShareData) => boolean;
	share?: (data: ShareData) => Promise<void>;
}

export function uniqueNames(names: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return names.map((name) => {
		const count = (seen.get(name) ?? 0) + 1;
		seen.set(name, count);
		if (count === 1) return name;
		const dot = name.lastIndexOf('.');
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : '';
		return `${stem}-${count}${ext}`;
	});
}

export async function buildShareFiles(shots: readonly Shot[]): Promise<File[]> {
	const tags = shots.map((shot) => ({ jobId: shot.jobId, room: shot.room, stepKey: shot.stepKey }));
	const names = uniqueNames(tags.map((tag) => shotFileName(tag)));
	const files: File[] = [];
	for (const [i, shot] of shots.entries()) {
		const bytes = new Uint8Array(await shot.blob.arrayBuffer());
		files.push(new File([withShotComment(bytes, tags[i])], names[i], { type: 'image/jpeg' }));
	}
	return files;
}

export function canShareFiles(nav: ShareNavigator, files: readonly File[]): boolean {
	if (!files.length || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') {
		return false;
	}
	try {
		return nav.canShare({ files: [...files] });
	} catch {
		return false;
	}
}

export function downloadFiles(files: readonly File[]): void {
	for (const file of files) {
		const url = URL.createObjectURL(file);
		const link = document.createElement('a');
		link.href = url;
		link.download = file.name;
		link.rel = 'noopener';
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 30_000);
	}
}

export async function shareFiles(
	files: readonly File[],
	title: string,
	nav: ShareNavigator = navigator,
	download: (files: readonly File[]) => void = downloadFiles
): Promise<ShareOutcome> {
	if (!files.length) return 'failed';
	if (canShareFiles(nav, files)) {
		try {
			await nav.share?.({ files: [...files], title });
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		}
	}
	download(files);
	return 'downloaded';
}
