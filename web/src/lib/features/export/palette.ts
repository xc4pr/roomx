export interface Palette {
	window: string;
	door: string;
	electric: string;
	fixture: string;
	fire: string;
	air: string;
	item: string;
	suggested: string;
	ink: string;
	muted: string;
	line: string;
	soft: string;
	accent: string;
}

// Paper is always light, so the PDF mirrors the light values of ui/tokens.css.
export const PAPER_PALETTE: Palette = {
	window: '#2b7bd0',
	door: '#d9741a',
	electric: '#d9a800',
	fixture: '#858c95',
	fire: '#c8372d',
	air: '#2f8f9d',
	item: '#c9cdca',
	suggested: '#7b5bd4',
	ink: '#1c1f23',
	muted: '#636a72',
	line: '#e0ddd5',
	soft: '#f6f5f2',
	accent: '#09845d'
};
