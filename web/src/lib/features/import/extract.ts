import { LIMITS } from '#lib/security/limits.ts';

export type ExtractFailure = 'empty' | 'noJson' | 'broken' | 'truncated' | 'tooLarge';

export type ExtractResult = { ok: true; value: unknown } | { ok: false; reason: ExtractFailure };

const PLAN_MARKER = 'roomx-plan';
const MAX_CANDIDATES = 200;
const MAX_NESTING = 100;
const LOOKAHEAD = 400;
const BUDGET_FACTOR = 4;
const MIN_BUDGET = 200_000;

const SMART_QUOTES = '\u201c\u201d\u201e\u201f\u00ab\u00bb';
const SPACE_LIKE =
	'\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000';
const INVISIBLE = '\u200b\u200c\u200d\u2060\ufeff';

type Scan =
	| { kind: 'ok'; source: string; consumed: number }
	| { kind: 'unterminated' | 'abandoned'; consumed: number };

function isQuote(char: string): boolean {
	return char === '"' || SMART_QUOTES.includes(char);
}

function escapeControl(code: number): string {
	switch (code) {
		case 10:
			return '\\n';
		case 13:
			return '\\r';
		case 9:
			return '\\t';
		default:
			return `\\u${code.toString(16).padStart(4, '0')}`;
	}
}

// Reads one object from `start` and returns it as strict JSON: comments, trailing commas, typographic quotes and odd spaces are repaired outside of strings only. One pass, never more than `limit` characters.
function scanObject(text: string, start: number, limit: number): Scan {
	const stop = Math.min(text.length, start + limit);
	let out = '';
	let held: string | null = null;
	let braces = 0;
	let nesting = 0;
	let i = start;
	const emit = (chunk: string): void => {
		if (held !== null) {
			out += held;
			held = null;
		}
		out += chunk;
	};
	const blank = (chunk: string): void => {
		if (held !== null) held += chunk;
		else out += chunk;
	};
	const unfinished = (): Scan => ({
		kind: stop === text.length ? 'unterminated' : 'abandoned',
		consumed: i - start
	});

	while (i < stop) {
		const char = text[i];
		if (isQuote(char)) {
			const smart = char !== '"';
			let literal = '"';
			i++;
			let closed = false;
			while (i < stop) {
				const inner = text[i];
				if (inner === '\\') {
					const next = text[i + 1];
					if (next === undefined) break;
					literal += next === "'" ? "'" : `\\${next}`;
					i += 2;
					continue;
				}
				if (inner === '"' || (smart && SMART_QUOTES.includes(inner))) {
					closed = true;
					i++;
					break;
				}
				const code = inner.charCodeAt(0);
				literal += code < 32 ? escapeControl(code) : inner;
				i++;
			}
			if (!closed) return unfinished();
			emit(`${literal}"`);
			continue;
		}
		if (char === '/' && text[i + 1] === '/') {
			const end = text.indexOf('\n', i);
			i = end === -1 ? text.length : end + 1;
			blank(' ');
			continue;
		}
		if (char === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			if (end === -1) {
				i = text.length;
				return unfinished();
			}
			i = end + 2;
			blank(' ');
			continue;
		}
		i++;
		if (char === '{' || char === '[') {
			nesting++;
			if (nesting > MAX_NESTING) return { kind: 'abandoned', consumed: i - start };
			if (char === '{') braces++;
			emit(char);
		} else if (char === '}' || char === ']') {
			nesting--;
			if (held !== null) {
				out += held.slice(1);
				held = null;
			}
			out += char;
			if (char === '}' && --braces === 0) {
				return { kind: 'ok', source: out, consumed: i - start };
			}
		} else if (char === ',') {
			if (held !== null) {
				out += held;
			}
			held = ',';
		} else if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
			blank(char);
		} else if (SPACE_LIKE.includes(char)) {
			blank(' ');
		} else if (INVISIBLE.includes(char)) {
			continue;
		} else {
			emit(char);
		}
	}
	return unfinished();
}

function looksLikeObject(text: string, brace: number): boolean {
	const limit = Math.min(text.length, brace + LOOKAHEAD);
	let i = brace + 1;
	while (i < limit) {
		const char = text[i];
		if (
			char === ' ' ||
			char === '\n' ||
			char === '\t' ||
			char === '\r' ||
			SPACE_LIKE.includes(char)
		) {
			i++;
		} else if (char === '/' && text[i + 1] === '/') {
			const end = text.indexOf('\n', i);
			if (end === -1 || end >= limit) return false;
			i = end + 1;
		} else if (char === '/' && text[i + 1] === '*') {
			const end = text.slice(i + 2, limit).indexOf('*/');
			if (end === -1) return false;
			i += end + 4;
		} else {
			return char === '}' || isQuote(char);
		}
	}
	return false;
}

function parseObject(source: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(source);
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

export function extractPlan(input: string): ExtractResult {
	if (input.length > LIMITS.planText) return { ok: false, reason: 'tooLarge' };
	const text = input.replace(/^\ufeff/, '').trim();
	if (text === '') return { ok: false, reason: 'empty' };
	const whole = parseObject(text);
	if (whole) return { ok: true, value: whole };

	const mentionsPlan = text.includes(PLAN_MARKER);
	let fallback: Record<string, unknown> | undefined;
	let truncated = false;
	let sawBrace = false;
	let attempts = 0;
	let budget = Math.max(BUDGET_FACTOR * text.length, MIN_BUDGET);
	for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
		sawBrace = true;
		if (!looksLikeObject(text, start)) continue;
		if (attempts >= MAX_CANDIDATES || budget <= 0) break;
		attempts++;
		const scan = scanObject(text, start, budget);
		budget -= scan.consumed;
		if (scan.kind === 'unterminated') {
			truncated = true;
			continue;
		}
		if (scan.kind !== 'ok') continue;
		const candidate = parseObject(scan.source);
		if (!candidate) continue;
		if (candidate.format === PLAN_MARKER) return { ok: true, value: candidate };
		fallback ??= candidate;
	}
	if (fallback && !mentionsPlan) return { ok: true, value: fallback };
	if (!sawBrace || (attempts === 0 && !mentionsPlan)) return { ok: false, reason: 'noJson' };
	return { ok: false, reason: truncated && mentionsPlan ? 'truncated' : 'broken' };
}
