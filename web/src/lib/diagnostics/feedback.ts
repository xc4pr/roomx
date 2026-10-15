import { OPERATOR_EMAIL } from '#lib/features/legal/operator.ts';

export type FeedbackKind = 'issues' | 'email';

export interface FeedbackChannel {
	kind: FeedbackKind;
	href: string;
}

export const FEEDBACK_CHANNELS: readonly FeedbackChannel[] = [
	{ kind: 'issues', href: 'https://github.com/xc4pr/roomx/issues/new/choose' },
	{ kind: 'email', href: `mailto:${OPERATOR_EMAIL}?subject=RoomX` }
];

export function isSafeFeedbackHref(href: string): boolean {
	try {
		const url = new URL(href);
		return url.protocol === 'https:' || url.protocol === 'mailto:';
	} catch {
		return false;
	}
}

export function feedbackChannels(): FeedbackChannel[] {
	return FEEDBACK_CHANNELS.filter((channel) => isSafeFeedbackHref(channel.href));
}
