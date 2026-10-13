export interface InstallEnvironment {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
	standalone: boolean;
}

export function isIosSafari(env: InstallEnvironment): boolean {
	const ios =
		/iPhone|iPad|iPod/.test(env.userAgent) ||
		(env.platform === 'MacIntel' && env.maxTouchPoints > 1);
	return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(env.userAgent);
}

export function shouldShowInstallHint(env: InstallEnvironment, seen: boolean): boolean {
	return !seen && !env.standalone && isIosSafari(env);
}

export function readEnvironment(): InstallEnvironment {
	return {
		userAgent: navigator.userAgent,
		platform: navigator.platform,
		maxTouchPoints: navigator.maxTouchPoints,
		standalone:
			(navigator as Navigator & { standalone?: boolean }).standalone === true ||
			matchMedia('(display-mode: standalone)').matches
	};
}
