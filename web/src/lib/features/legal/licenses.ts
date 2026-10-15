import { parseLicenses, type LicenseData } from './licenseData.ts';

const sources = import.meta.glob<{ default: unknown }>('./licenses.generated.json');

export async function loadLicenses(): Promise<LicenseData | null> {
	const load = sources['./licenses.generated.json'];
	if (!load) return null;
	try {
		return parseLicenses((await load()).default);
	} catch {
		return null;
	}
}
