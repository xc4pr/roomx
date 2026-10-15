const FORMULA_START = /^[=+\-@\t\r]/;

// Spreadsheet programs run text that starts with one of these characters as a formula. Applies to free text from plans and backups, not to numbers.
export function neutralizeFormula(text: string): string {
	return FORMULA_START.test(text) ? `'${text}` : text;
}
