export type CspDirectives = Record<string, string[]>;

export interface CspOptions {
	localOnly: boolean;
	connectSrc?: string;
}

// The self-hosted edition reaches a sync server whose address the user types in at runtime, so a static policy cannot name it. Unless a build lists explicit origins, that edition may connect to any http(s) origin; scripts, frames and objects stay locked down either way.
export function cspDirectives({ localOnly, connectSrc }: CspOptions): CspDirectives {
	const extra = (connectSrc ?? '').split(/\s+/).filter(Boolean);
	const connect = localOnly
		? ['self']
		: extra.length > 0
			? ['self', ...extra]
			: ['self', 'http:', 'https:'];
	return {
		'default-src': ['self'],
		'script-src': ['self'],
		'style-src': ['self', 'unsafe-inline'],
		'img-src': ['self', 'blob:', 'data:'],
		'font-src': ['self'],
		'media-src': ['self', 'blob:'],
		'connect-src': connect,
		'worker-src': ['self', 'blob:'],
		'manifest-src': ['self'],
		'frame-src': ['none'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self']
	};
}
