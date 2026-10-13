export const shortcuts = $state({ open: false });

export function openShortcuts(): void {
	shortcuts.open = true;
}
