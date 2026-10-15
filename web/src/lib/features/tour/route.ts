export type RouteScreen = 'projects' | 'settings' | 'plan' | '3d' | 'furnish' | 'share' | 'other';

export interface ParsedRoute {
	screen: RouteScreen;
	projectId: string | null;
}

export function parseRoute(pathname: string, base = ''): ParsedRoute {
	const local = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
	const clean = local.replace(/\/+$/, '');
	if (clean === '') return { screen: 'projects', projectId: null };
	if (clean === '/settings') return { screen: 'settings', projectId: null };
	const match = /^\/p\/([^/]+)(?:\/(3d|furnish|share))?$/.exec(clean);
	if (!match) return { screen: 'other', projectId: null };
	return {
		screen: (match[2] as RouteScreen | undefined) ?? 'plan',
		projectId: decodeURIComponent(match[1])
	};
}
