import type { Brief } from '#lib/core/schema.ts';
import { formatChf, type Language } from '#lib/core/units.ts';
import type { PdfKey } from './pdfKit.ts';
import type { Translate } from './text.ts';

export function briefLines(
	brief: Brief | undefined,
	tr: Translate<PdfKey>,
	language: Language
): string[] {
	if (!brief) return [];
	const lines: string[] = [];
	const persons = brief.persons;
	let people = tr('briefPersons', { adults: persons.adults, children: persons.children });
	if (persons.childAges && persons.childAges.length > 0) {
		people += ` (${tr('briefAges', { ages: persons.childAges.join(', ') })})`;
	}
	if (persons.pets) people += ` · ${tr('briefPets', { pets: persons.pets })}`;
	lines.push(people);
	if (brief.bedSizes.length > 0) lines.push(tr('briefBeds', { beds: brief.bedSizes.join(', ') }));
	brief.workstations.forEach((station, index) => {
		const parts = [
			station.monitors === 1 ? tr('briefMonitorOne') : tr('briefMonitors', { n: station.monitors })
		];
		if (station.monitorInch) parts.push(`${station.monitorInch}"`);
		if (station.computer) parts.push(tr(`computer_${station.computer}`));
		if (station.sitStand) parts.push(tr('briefSitStand'));
		if (station.devices && station.devices.length > 0) parts.push(station.devices.join(', '));
		lines.push(tr('briefWorkstation', { n: index + 1, details: parts.join(' · ') }));
	});
	if (brief.style) lines.push(tr('briefStyle', { style: brief.style }));
	if (brief.budgetChf !== undefined) {
		lines.push(tr('briefBudget', { amount: formatChf(brief.budgetChf, language) }));
	}
	if (brief.retailers && brief.retailers.length > 0) {
		lines.push(tr('briefRetailers', { retailers: brief.retailers.join(', ') }));
	}
	for (const keep of brief.keep ?? []) {
		lines.push(
			tr('briefKeep', {
				name: keep.name,
				dims: keep.dims ? ` (${keep.dims.w} × ${keep.dims.d} × ${keep.dims.h} mm)` : ''
			})
		);
	}
	if (brief.wishes) lines.push(tr('briefWishes', { wishes: brief.wishes }));
	return lines;
}
