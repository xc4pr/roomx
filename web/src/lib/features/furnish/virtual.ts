export interface VirtualInput {
	count: number;
	columns: number;
	rowPitch: number;
	scrollTop: number;
	viewport: number;
	buffer?: number;
}

export interface VirtualRange {
	start: number;
	end: number;
	offset: number;
	totalRows: number;
}

export function gridColumns(width: number, minColumn: number, gap: number): number {
	if (width <= 0) return 1;
	return Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
}

export function visibleRange(input: VirtualInput): VirtualRange {
	const { count, columns, rowPitch, scrollTop, viewport } = input;
	const buffer = input.buffer ?? 2;
	const totalRows = Math.ceil(count / columns);
	const first = Math.floor(Math.max(0, scrollTop) / rowPitch) - buffer;
	const last = Math.ceil((Math.max(0, scrollTop) + viewport) / rowPitch) + buffer;
	const firstRow = Math.min(Math.max(0, first), totalRows);
	const lastRow = Math.min(Math.max(firstRow, last), totalRows);
	return {
		start: firstRow * columns,
		end: Math.min(count, lastRow * columns),
		offset: firstRow * rowPitch,
		totalRows
	};
}
