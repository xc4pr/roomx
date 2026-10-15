import { locale, t } from '#lib/i18n/index.svelte.ts';
import type { HostJobStatus } from '#lib/mirror/types.ts';
import { messages } from './i18n.ts';

export function statusText(status: HostJobStatus): string {
	const { received, expected } = status;
	if (status.status === 'ended') return t(messages, 'statusEnded');
	if (status.status === 'connected') {
		if (expected > 0)
			return t(messages, 'statusConnectedProgress', {
				done: received,
				total: received + expected
			});
		if (received > 0) return t(messages, 'statusConnectedReceived', { n: received });
		return t(messages, 'statusConnected');
	}
	if (received === 1) return t(messages, 'statusReceivedOne');
	if (received > 1) return t(messages, 'statusReceived', { n: received });
	return t(messages, 'statusWaiting');
}

export function formatExpiry(timestamp: number): string {
	return new Date(timestamp).toLocaleString(locale.language === 'de' ? 'de-CH' : 'en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}
