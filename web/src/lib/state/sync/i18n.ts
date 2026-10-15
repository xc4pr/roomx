import { defineMessages } from '#lib/i18n/index.svelte.ts';

export const messages = defineMessages({
	de: {
		conflictLabel: 'Konflikt',
		conflictCopyName: '{name} (Konflikt {device} {date})',
		conflictCopyNameAnonymous: '{name} (Konflikt {date})',
		conflictToast:
			'«{name}» wurde auf einem anderen Gerät geändert. Deine Änderungen liegen als Kopie «{copy}» vor.',
		conflictToastMany:
			'{n} Projekte wurden auf einem anderen Gerät geändert. Deine Änderungen liegen als Kopien vor.'
	},
	en: {
		conflictLabel: 'Conflict',
		conflictCopyName: '{name} (Conflict {device} {date})',
		conflictCopyNameAnonymous: '{name} (Conflict {date})',
		conflictToast:
			'“{name}” was changed on another device. Your changes are kept as the copy “{copy}”.',
		conflictToastMany:
			'{n} projects were changed on another device. Your changes are kept as copies.'
	}
});
