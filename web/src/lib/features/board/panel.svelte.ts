import type { SheetSnap } from '#lib/ui/sheet.ts';

export const panel = $state<{ snap: SheetSnap }>({ snap: 'half' });
