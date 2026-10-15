import type { MirrorNetworkConfig } from './config.ts';

// Fixed at build time (see config.ts); the content security policy lists the same relays.
export const MIRROR_NETWORK: MirrorNetworkConfig = {
	relays: __ROOMX_MIRROR_RELAYS__,
	stun: __ROOMX_MIRROR_STUN__
};
