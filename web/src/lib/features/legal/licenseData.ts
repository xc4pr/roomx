import { z } from 'zod';

export const LicensePackageSchema = z.object({
	name: z.string(),
	version: z.string(),
	license: z.string(),
	author: z.string().optional(),
	homepage: z.string().optional(),
	font: z.boolean(),
	text: z.string()
});

export const LicenseDataSchema = z.object({
	generated: z.string(),
	packages: z.array(LicensePackageSchema)
});

export type LicensePackage = z.infer<typeof LicensePackageSchema>;
export type LicenseData = z.infer<typeof LicenseDataSchema>;

export interface PnpmPackage {
	name: string;
	versions: string[];
	paths: string[];
	license: string;
	author?: string;
	homepage?: string;
}

export type PnpmListing = Record<string, PnpmPackage[]>;

export const RUNTIME_EXTRAS = ['@sveltejs/kit'];
export const MAX_TEXT_LENGTH = 20_000;

export function selectPackages(
	production: PnpmListing,
	everything: PnpmListing,
	extras: readonly string[] = RUNTIME_EXTRAS
): PnpmPackage[] {
	const chosen = new Map<string, PnpmPackage>();
	for (const entries of Object.values(production)) {
		for (const entry of entries) chosen.set(entry.name, entry);
	}
	for (const entries of Object.values(everything)) {
		for (const entry of entries) {
			if (extras.includes(entry.name) && !chosen.has(entry.name)) chosen.set(entry.name, entry);
		}
	}
	return [...chosen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function isFont(name: string): boolean {
	return name.startsWith('@fontsource/') || name.startsWith('@fontsource-variable/');
}

export function collectLicenses(
	packages: readonly PnpmPackage[],
	readText: (paths: readonly string[]) => string,
	generated: string
): LicenseData {
	return {
		generated,
		packages: packages.map((entry) => ({
			name: entry.name,
			version: [...new Set(entry.versions)].join(', '),
			license: entry.license,
			...(entry.author ? { author: entry.author } : {}),
			...(entry.homepage ? { homepage: entry.homepage } : {}),
			font: isFont(entry.name),
			text: readText(entry.paths).slice(0, MAX_TEXT_LENGTH)
		}))
	};
}

export function groupByLicense(
	packages: readonly LicensePackage[]
): { license: string; packages: LicensePackage[] }[] {
	const groups = new Map<string, LicensePackage[]>();
	for (const entry of packages) {
		const list = groups.get(entry.license) ?? [];
		list.push(entry);
		groups.set(entry.license, list);
	}
	return [...groups.entries()]
		.map(([license, list]) => ({ license, packages: list }))
		.sort((a, b) => b.packages.length - a.packages.length || a.license.localeCompare(b.license));
}

export function parseLicenses(raw: unknown): LicenseData | null {
	const parsed = LicenseDataSchema.safeParse(raw);
	return parsed.success && parsed.data.packages.length > 0 ? parsed.data : null;
}
