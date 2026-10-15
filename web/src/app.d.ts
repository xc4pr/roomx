declare global {
	// Set at build time: the free edition never talks to a server of its own.
	const __ROOMX_EDITION__: 'free' | 'pro';
	const __ROOMX_VERSION__: string;
	const __ROOMX_BUILD_DATE__: string;
	namespace App {}
}

export {};
