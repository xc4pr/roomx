import type { Project } from '#lib/core/schema.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { runFullBackup } from './backupActions.ts';
import { messages } from './i18n.ts';

export async function backupAndAnnounce(overrides: readonly Project[] = []): Promise<boolean> {
	try {
		const result = await runFullBackup(overrides);
		if (!result) {
			toasts.show({ message: t(messages, 'backupEmpty') });
			return false;
		}
		const done =
			result.projectCount === 1
				? t(messages, 'backupDoneOne', { photos: result.photoCount })
				: t(messages, 'backupDone', { n: result.projectCount, photos: result.photoCount });
		const notes = [
			result.missingPhotos > 0 ? t(messages, 'backupMissing', { n: result.missingPhotos }) : '',
			result.unreadableCount > 0
				? t(messages, 'backupUnreadable', { n: result.unreadableCount })
				: ''
		].filter(Boolean);
		if (notes.length > 0) {
			toasts.show({
				message: [done, ...notes].join('. '),
				kind: 'error',
				duration: 10_000
			});
		} else {
			toasts.show({ message: done, kind: 'success' });
		}
		return true;
	} catch {
		toasts.show({
			message: t(messages, 'backupFailed'),
			kind: 'error',
			actionLabel: t(messages, 'backupRetry'),
			onaction: () => void backupAndAnnounce(overrides)
		});
		return false;
	}
}
