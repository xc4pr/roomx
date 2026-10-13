import { migrateProject, UnsupportedVersionError } from '#lib/core/migrations.ts';
import type { Project } from '#lib/core/schema.ts';
import { db } from '../db.ts';
import { AuthError, HttpError, NetworkError, type Api } from './api.ts';
import { projectPhotoHashes, uploadPhotos } from './photos.ts';
import { planSync, type LocalEntry, type RemoteEntry, type SyncAction } from './plan.ts';

export interface Host {
	openProjectId(): string | null;
	flush(): Promise<void>;
	replaceOpen(project: Project): void;
	closeOpen(): void;
}

export interface RunContext {
	api: Api;
	host: Host;
	newId: () => string;
	now: () => Date;
	conflictName: (name: string, date: string) => string;
}

export interface ConflictInfo {
	originalId: string;
	originalName: string;
	copyId: string;
	name: string;
}

export type RunOutcome = 'ok' | 'offline' | 'unauthorized' | 'error';

export interface RunResult {
	outcome: RunOutcome;
	conflicts: ConflictInfo[];
	pulled: string[];
	photoHashes: string[];
	pushed: number;
	failed: number;
	again: boolean;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function emptyResult(): RunResult {
	return {
		outcome: 'ok',
		conflicts: [],
		pulled: [],
		photoHashes: [],
		pushed: 0,
		failed: 0,
		again: false
	};
}

async function readLocal(): Promise<LocalEntry[]> {
	const [projects, records] = await Promise.all([db.projects.toArray(), db.sync.toArray()]);
	const byId = new Map(records.map((record) => [record.projectId, record]));
	return projects
		.filter((project) => ID_PATTERN.test(project.id))
		.map((project) => {
			const record = byId.get(project.id);
			return {
				id: project.id,
				baseRev: record?.baseRev ?? 0,
				dirty: record ? record.dirty : true,
				deleted: project.deleted === true
			};
		});
}

function toRemoteEntries(list: Awaited<ReturnType<Api['list']>>): RemoteEntry[] {
	return list
		.filter((entry) => ID_PATTERN.test(entry.id))
		.map((entry) => ({ id: entry.id, rev: entry.rev, deleted: entry.deleted }));
}

async function applyRemote(
	ctx: RunContext,
	project: Project,
	force: boolean,
	result: RunResult
): Promise<void> {
	const open = ctx.host.openProjectId() === project.id;
	if (open) await ctx.host.flush();
	let applied = false;
	await db.transaction('rw', db.projects, db.sync, db.previews, async () => {
		const record = await db.sync.get(project.id);
		if (record?.dirty && !force) return;
		await db.projects.put(project);
		await db.sync.put({
			projectId: project.id,
			baseRev: project.rev,
			dirty: false,
			syncedAt: ctx.now().toISOString()
		});
		if (project.deleted) await db.previews.delete(project.id);
		applied = true;
	});
	if (!applied) {
		result.again = true;
		return;
	}
	if (open) {
		if (project.deleted) ctx.host.closeOpen();
		else ctx.host.replaceOpen(project);
	}
	if (!project.deleted) {
		result.pulled.push(project.id);
		result.photoHashes.push(...projectPhotoHashes(project));
	}
}

async function resolveConflict(
	ctx: RunContext,
	id: string,
	serverRaw: Record<string, unknown>,
	result: RunResult
): Promise<void> {
	const server = migrateProject(serverRaw);
	const open = ctx.host.openProjectId() === id;
	if (open) await ctx.host.flush();
	const created: ConflictInfo[] = [];
	await db.transaction('rw', db.projects, db.sync, db.previews, async () => {
		const record = await db.sync.get(id);
		const local = await db.projects.get(id);
		const syncedAt = ctx.now().toISOString();
		if (local && record?.dirty && !local.deleted) {
			const copyId = ctx.newId();
			const date = ctx.now().toISOString().slice(0, 10);
			const name = ctx.conflictName(local.name, date);
			await db.projects.put({
				...migrateProject(local),
				id: copyId,
				name,
				rev: 0,
				updatedAt: ctx.now().toISOString()
			});
			await db.sync.put({ projectId: copyId, baseRev: 0, dirty: true });
			created.push({ originalId: id, originalName: local.name, copyId, name });
		}
		await db.projects.put(server);
		await db.sync.put({ projectId: id, baseRev: server.rev, dirty: false, syncedAt });
		if (server.deleted) await db.previews.delete(id);
	});
	if (created.length > 0) {
		result.conflicts.push(...created);
		result.again = true;
	}
	if (open) {
		if (server.deleted) ctx.host.closeOpen();
		else ctx.host.replaceOpen(server);
	}
	if (!server.deleted) {
		result.pulled.push(id);
		result.photoHashes.push(...projectPhotoHashes(server));
	}
}

async function commitPush(
	ctx: RunContext,
	pushed: Project,
	saved: Record<string, unknown>,
	result: RunResult
): Promise<void> {
	const rev = typeof saved.rev === 'number' ? saved.rev : pushed.rev + 1;
	let changedSince = false;
	await db.transaction('rw', db.projects, db.sync, async () => {
		const current = await db.projects.get(pushed.id);
		if (!current) return;
		changedSince = current.updatedAt !== pushed.updatedAt;
		await db.projects.put({ ...current, rev });
		await db.sync.put({
			projectId: pushed.id,
			baseRev: rev,
			dirty: changedSince,
			syncedAt: ctx.now().toISOString()
		});
	});
	result.pushed += 1;
	if (changedSince) result.again = true;
}

async function push(
	ctx: RunContext,
	id: string,
	baseRev: number,
	result: RunResult
): Promise<void> {
	const raw = await db.projects.get(id);
	if (!raw) return;
	const project = migrateProject(raw);
	if (!project.deleted) await uploadPhotos(ctx.api, projectPhotoHashes(project));
	let base = baseRev;
	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await ctx.api.put(id, base, project);
		if (response.kind === 'missing') {
			if (base === 0) throw new HttpError(404);
			base = 0;
			continue;
		}
		if (response.kind === 'conflict') {
			await resolveConflict(ctx, id, response.project, result);
			return;
		}
		await commitPush(ctx, project, response.project, result);
		return;
	}
}

async function pull(ctx: RunContext, id: string, force: boolean, result: RunResult): Promise<void> {
	const project = migrateProject(await ctx.api.get(id));
	await applyRemote(ctx, project, force, result);
}

async function execute(ctx: RunContext, action: SyncAction, result: RunResult): Promise<void> {
	if (action.type === 'push') await push(ctx, action.id, action.baseRev, result);
	else if (action.type === 'pull') await pull(ctx, action.id, action.force, result);
	else await resolveConflict(ctx, action.id, await ctx.api.get(action.id), result);
}

export async function runSync(ctx: RunContext): Promise<RunResult> {
	const result = emptyResult();
	try {
		await ctx.host.flush();
		const remote = toRemoteEntries(await ctx.api.list());
		const actions = planSync(await readLocal(), remote);
		for (const action of actions) {
			try {
				await execute(ctx, action, result);
			} catch (error) {
				if (error instanceof NetworkError || error instanceof AuthError) throw error;
				if (!(error instanceof UnsupportedVersionError)) result.failed += 1;
			}
		}
		if (result.failed > 0) result.outcome = 'error';
	} catch (error) {
		if (error instanceof NetworkError) result.outcome = 'offline';
		else if (error instanceof AuthError) result.outcome = 'unauthorized';
		else result.outcome = 'error';
	}
	return result;
}
