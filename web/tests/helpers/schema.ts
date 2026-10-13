type Json = unknown;
type Node = Record<string, Json>;

function typeOf(value: Json): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

function matchesType(value: Json, type: string): boolean {
	if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
	return typeOf(value) === type;
}

export function validate(value: Json, schema: Node, path = '$'): string[] {
	const errors: string[] = [];
	const fail = (message: string) => errors.push(`${path}: ${message}`);

	if ('const' in schema && value !== schema.const) fail(`expected ${JSON.stringify(schema.const)}`);
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
		fail(`${JSON.stringify(value)} not in enum`);
	}
	if (Array.isArray(schema.oneOf)) {
		const matching = schema.oneOf.filter(
			(option) => validate(value, option as Node, path).length === 0
		);
		if (matching.length === 0) fail('matches no oneOf option');
	}
	const type = schema.type;
	if (typeof type === 'string' && !matchesType(value, type)) {
		fail(`expected ${type}, got ${typeOf(value)}`);
		return errors;
	}
	if (Array.isArray(type) && !type.some((entry) => matchesType(value, entry as string))) {
		fail(`expected one of ${type.join('|')}, got ${typeOf(value)}`);
		return errors;
	}

	if (typeof value === 'number') {
		if (typeof schema.minimum === 'number' && value < schema.minimum) fail('below minimum');
		if (typeof schema.maximum === 'number' && value > schema.maximum) fail('above maximum');
		if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
			fail('not above exclusive minimum');
		}
	}
	if (typeof value === 'string' && typeof schema.minLength === 'number') {
		if (value.length < schema.minLength) fail('too short');
	}
	if (Array.isArray(value)) {
		if (typeof schema.minItems === 'number' && value.length < schema.minItems)
			fail('too few items');
		if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
			fail('too many items');
		if (schema.items && typeof schema.items === 'object') {
			value.forEach((entry, index) =>
				errors.push(...validate(entry, schema.items as Node, `${path}[${index}]`))
			);
		}
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const record = value as Node;
		const properties = (schema.properties ?? {}) as Record<string, Node>;
		for (const key of (schema.required ?? []) as string[]) {
			if (!(key in record)) fail(`missing required "${key}"`);
		}
		for (const [key, entry] of Object.entries(record)) {
			if (properties[key]) {
				errors.push(...validate(entry, properties[key], `${path}.${key}`));
			} else if (schema.additionalProperties === false) {
				fail(`unexpected property "${key}"`);
			} else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
				errors.push(...validate(entry, schema.additionalProperties as Node, `${path}.${key}`));
			}
		}
	}
	return errors;
}
