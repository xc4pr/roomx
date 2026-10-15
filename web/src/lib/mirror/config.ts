// Fixed host list for the phone mirror. The app contacts these hosts only while a photo job is open.
export const DEFAULT_MIRROR_RELAYS = [
	'wss://nos.lol',
	'wss://relay.damus.io',
	'wss://relay.primal.net',
	'wss://relay.snort.social',
	'wss://nostr.data.haus'
] as const;

export const DEFAULT_MIRROR_STUN = [
	'stun:stun.cloudflare.com:3478',
	'stun:stun.l.google.com:19302',
	'stun:stun1.l.google.com:19302'
] as const;

const LOCAL_RELAY = /^ws:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;
const PUBLIC_RELAY = /^wss:\/\/[a-z0-9.-]+(:\d{2,5})?(\/[a-z0-9/_-]*)?$/;

export interface MirrorNetworkConfig {
	relays: string[];
	stun: string[];
}

// Tests build against a local relay (ROOMX_MIRROR_RELAYS=ws://127.0.0.1:<port>, ROOMX_MIRROR_STUN=none) so CI never reaches public services.
export function resolveMirrorNetwork(env: Record<string, string | undefined>): MirrorNetworkConfig {
	const relays = (env.ROOMX_MIRROR_RELAYS ?? '').split(/\s+/).filter(Boolean);
	for (const relay of relays) {
		if (!LOCAL_RELAY.test(relay) && !PUBLIC_RELAY.test(relay)) {
			throw new Error(`ROOMX_MIRROR_RELAYS: not a ws(s) relay URL: ${relay}`);
		}
	}
	const stunSetting = (env.ROOMX_MIRROR_STUN ?? '').trim();
	const stun =
		stunSetting === 'none' ? [] : stunSetting ? stunSetting.split(/\s+/) : [...DEFAULT_MIRROR_STUN];
	for (const server of stun) {
		if (!/^stun:[a-z0-9.-]+:\d{2,5}$/.test(server)) {
			throw new Error(`ROOMX_MIRROR_STUN: not a stun URL: ${server}`);
		}
	}
	return { relays: relays.length ? relays : [...DEFAULT_MIRROR_RELAYS], stun };
}
