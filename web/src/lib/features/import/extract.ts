export type ExtractFailure = 'empty' | 'noJson' | 'broken' | 'truncated';

export type ExtractResult = { ok: true; value: unknown } | { ok: false; reason: ExtractFailure };

const PLAN_MARKER = 'roomx-plan';
const MAX_STARTS = 4000;

function matchingEnd(text: string, start: number): number {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const char = text[i];
		if (inString) {
			if (char === '\\') i++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
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
	const text = input.replace(/^﻿/, '').trim();
	if (text === '') return { ok: false, reason: 'empty' };
	const whole = parseObject(text);
	if (whole) return { ok: true, value: whole };

	const mentionsPlan = text.includes(PLAN_MARKER);
	let fallback: Record<string, unknown> | undefined;
	let truncated = false;
	let sawBrace = false;
	let starts = 0;
	for (let start = text.indexOf('{'); start !== -1 && starts < MAX_STARTS;) {
		sawBrace = true;
		starts++;
		const end = matchingEnd(text, start);
		if (end === -1) {
			truncated = true;
		} else {
			const candidate = parseObject(text.slice(start, end + 1));
			if (candidate) {
				if (candidate.format === PLAN_MARKER) return { ok: true, value: candidate };
				fallback ??= candidate;
			}
		}
		start = text.indexOf('{', start + 1);
	}
	if (fallback && !mentionsPlan) return { ok: true, value: fallback };
	if (!sawBrace) return { ok: false, reason: 'noJson' };
	return { ok: false, reason: truncated && mentionsPlan ? 'truncated' : 'broken' };
}
