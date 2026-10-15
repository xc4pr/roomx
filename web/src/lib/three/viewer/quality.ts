export type QualityTier = 0 | 1 | 2;

export interface DeviceHints {
	deviceMemory?: number;
	hardwareConcurrency?: number;
	coarsePointer: boolean;
}

export interface QualityProfile {
	maxPixelRatio: number;
	maxPixels: number;
	shadows: boolean;
	shadowMapSize: number;
}

export interface GovernorConfig {
	windowSize: number;
	minSamples: number;
	minSlowSamples: number;
	minSlowMs: number;
	warmupMs: number;
	maxDeltaMs: number;
	lowerBelowFps: number;
	raiseAboveFps: number;
	raiseAfterSamples: number;
	confirmSamples: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
	windowSize: 40,
	minSamples: 30,
	minSlowSamples: 8,
	minSlowMs: 2000,
	warmupMs: 1200,
	maxDeltaMs: 2500,
	lowerBelowFps: 24,
	raiseAboveFps: 50,
	raiseAfterSamples: 240,
	confirmSamples: 90
};

export const LOWEST_TIER: QualityTier = 2;

export function isWeakDevice(hints: DeviceHints): boolean {
	const memory = hints.deviceMemory;
	const cores = hints.hardwareConcurrency;
	if (memory !== undefined && memory <= 2) return true;
	if (cores !== undefined && cores <= 2) return true;
	if (!hints.coarsePointer) return false;
	return (memory !== undefined && memory <= 4) || (cores !== undefined && cores <= 4);
}

export function profileFor(tier: QualityTier, weak: boolean): QualityProfile {
	if (tier === 0) {
		return {
			maxPixelRatio: weak ? 1.5 : 2,
			maxPixels: weak ? 2_400_000 : 6_000_000,
			shadows: true,
			shadowMapSize: weak ? 1024 : 2048
		};
	}
	if (tier === 1) {
		return {
			maxPixelRatio: weak ? 1.25 : 1.5,
			maxPixels: weak ? 1_400_000 : 2_600_000,
			shadows: false,
			shadowMapSize: 1024
		};
	}
	return { maxPixelRatio: 0.75, maxPixels: 1_100_000, shadows: false, shadowMapSize: 1024 };
}

export function pixelRatioFor(
	width: number,
	height: number,
	devicePixelRatio: number,
	profile: QualityProfile
): number {
	const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
	const area = Math.max(1, width) * Math.max(1, height);
	const ratio = Math.min(dpr, profile.maxPixelRatio, Math.sqrt(profile.maxPixels / area));
	return Math.max(0.5, Math.round(ratio * 100) / 100);
}

export class QualityGovernor {
	readonly #config: GovernorConfig;
	#tier: QualityTier;
	#best: QualityTier = 0;
	#probation: QualityTier | null = null;
	#probationSamples = 0;
	#samples: number[] = [];
	#sum = 0;
	#goodStreak = 0;
	#ignoreUntil = 0;

	constructor(config: Partial<GovernorConfig> = {}, start: QualityTier = 0) {
		this.#config = { ...DEFAULT_GOVERNOR, ...config };
		this.#tier = start;
	}

	get tier(): QualityTier {
		return this.#tier;
	}

	reset(now: number): void {
		this.#samples = [];
		this.#sum = 0;
		this.#goodStreak = 0;
		this.#ignoreUntil = now + this.#config.warmupMs;
	}

	sample(deltaMs: number, now: number): QualityTier | null {
		const config = this.#config;
		if (now < this.#ignoreUntil) return null;
		if (!(deltaMs > 0) || deltaMs > config.maxDeltaMs) return null;
		this.#samples.push(deltaMs);
		this.#sum += deltaMs;
		if (this.#samples.length > config.windowSize) this.#sum -= this.#samples.shift() ?? 0;
		const length = this.#samples.length;
		const enough =
			length >= config.minSamples ||
			(length >= config.minSlowSamples && this.#sum >= config.minSlowMs);
		if (!enough) return null;
		const fps = (1000 * length) / this.#sum;
		if (this.#probation === this.#tier && ++this.#probationSamples >= config.confirmSamples) {
			this.#probation = null;
		}
		if (fps < config.lowerBelowFps) {
			this.#goodStreak = 0;
			return this.#lower(now);
		}
		this.#goodStreak = fps > config.raiseAboveFps ? this.#goodStreak + 1 : 0;
		if (this.#goodStreak >= config.raiseAfterSamples && this.#tier > this.#best) {
			this.#tier = (this.#tier - 1) as QualityTier;
			this.#probation = this.#tier;
			this.#probationSamples = 0;
			this.reset(now);
			return this.#tier;
		}
		return null;
	}

	penalize(now: number): QualityTier | null {
		const next = this.#lower(now);
		this.#best = this.#tier;
		return next;
	}

	#lower(now: number): QualityTier | null {
		if (this.#probation === this.#tier) {
			this.#best = Math.min(LOWEST_TIER, this.#tier + 1) as QualityTier;
			this.#probation = null;
		}
		if (this.#tier >= LOWEST_TIER) {
			this.reset(now);
			return null;
		}
		this.#tier = (this.#tier + 1) as QualityTier;
		this.reset(now);
		return this.#tier;
	}
}
