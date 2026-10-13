export interface LocalEntry {
	id: string;
	baseRev: number;
	dirty: boolean;
	deleted: boolean;
}

export interface RemoteEntry {
	id: string;
	rev: number;
	deleted: boolean;
}

export type SyncAction =
	| { type: 'push'; id: string; baseRev: number }
	| { type: 'pull'; id: string; force: boolean }
	| { type: 'conflict'; id: string };

function planBoth(local: LocalEntry, remote: RemoteEntry): SyncAction | null {
	if (remote.rev === local.baseRev) {
		return local.dirty ? { type: 'push', id: local.id, baseRev: remote.rev } : null;
	}
	if (remote.rev < local.baseRev) return { type: 'push', id: local.id, baseRev: remote.rev };
	if (!local.dirty) return { type: 'pull', id: local.id, force: false };
	if (local.deleted) return { type: 'pull', id: local.id, force: true };
	return { type: 'conflict', id: local.id };
}

export function planSync(
	local: readonly LocalEntry[],
	remote: readonly RemoteEntry[]
): SyncAction[] {
	const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
	const localIds = new Set(local.map((entry) => entry.id));
	const actions: SyncAction[] = [];
	for (const entry of local) {
		const other = remoteById.get(entry.id);
		if (!other) {
			if (!entry.deleted) actions.push({ type: 'push', id: entry.id, baseRev: 0 });
			continue;
		}
		const action = planBoth(entry, other);
		if (action) actions.push(action);
	}
	for (const entry of remote) {
		if (localIds.has(entry.id) || entry.deleted) continue;
		actions.push({ type: 'pull', id: entry.id, force: false });
	}
	return actions;
}
