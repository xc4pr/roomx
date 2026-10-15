import { LIMITS } from '#lib/security/limits.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import { messages } from './i18n.ts';
import { PhotoError, type PhotoErrorCode } from './image.ts';

const KEYS = {
	notImage: 'errorNotImage',
	heic: 'errorHeic',
	tooLarge: 'errorTooLarge',
	empty: 'errorEmpty',
	decode: 'errorDecode',
	encode: 'errorEncode',
	storage: 'errorStorage',
	readOnly: 'errorReadOnly',
	limit: 'errorLimit'
} as const satisfies Record<PhotoErrorCode, keyof (typeof messages)['de']>;

export function errorMessage(error: unknown, name: string): string {
	const code: PhotoErrorCode = error instanceof PhotoError ? error.code : 'encode';
	return t(messages, KEYS[code], { name, max: LIMITS.photosPerRoom });
}
