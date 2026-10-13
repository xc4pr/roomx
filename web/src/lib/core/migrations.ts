import { ProjectSchema, SCHEMA_VERSION, type Project } from './schema.ts';

type RawDocument = Record<string, unknown>;
type Migration = (document: RawDocument) => RawDocument;

// Key = version the document is migrated from; the result has version key + 1.
const MIGRATIONS: Record<number, Migration> = {
	0: (document) => ({
		...document,
		createdAt: document.createdAt ?? document.updatedAt ?? new Date(0).toISOString(),
		variants: document.variants ?? [],
		rev: document.rev ?? 0
	})
};

export class UnsupportedVersionError extends Error {
	readonly version: number;

	constructor(version: number) {
		super(`unsupported schema version ${version}`);
		this.version = version;
	}
}

export function migrateProject(raw: unknown): Project {
	if (typeof raw !== 'object' || raw === null) throw new Error('project is not an object');
	let document = raw as RawDocument;
	let version = typeof document.schemaVersion === 'number' ? document.schemaVersion : 0;
	if (version > SCHEMA_VERSION) throw new UnsupportedVersionError(version);
	while (version < SCHEMA_VERSION) {
		const migrate = MIGRATIONS[version];
		if (!migrate) throw new UnsupportedVersionError(version);
		document = { ...migrate(document), schemaVersion: version + 1 };
		version += 1;
	}
	return ProjectSchema.parse(document);
}
