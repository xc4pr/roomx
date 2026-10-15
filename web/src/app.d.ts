declare global {
	// Set at build time: the public edition never talks to a server of its own.
	const __ROOMX_LOCAL_ONLY__: boolean;
	const __ROOMX_VERSION__: string;
	const __ROOMX_BUILD_DATE__: string;
	namespace App {}
}

export {};
