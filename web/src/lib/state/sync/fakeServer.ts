export interface FakeServerOptions {
	token?: string;
}

type StoredProject = Record<string, unknown> & { id: string; rev: number };

export class FakeServer {
	projects = new Map<string, StoredProject>();
	photos = new Map<string, Blob>();
	log: string[] = [];
	token: string;
	offline = false;
	failProjectPuts = false;
	beforePut: ((id: string) => Promise<void> | void) | null = null;
	oversizedPhotos = new Set<string>();

	constructor(options: FakeServerOptions = {}) {
		this.token = options.token ?? 'token';
	}

	seed(project: Record<string, unknown> & { id: string }, rev = 1): void {
		this.projects.set(project.id, { ...project, rev });
	}

	fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
		const url = new URL(String(input));
		const method = init.method ?? 'GET';
		this.log.push(`${method} ${url.pathname}`);
		if (this.offline) throw new TypeError('network down');
		if (url.pathname === '/api/health') return json({ status: 'ok', version: 'test' });
		const headers = new Headers(init.headers);
		if (headers.get('Authorization') !== `Bearer ${this.token}`) {
			return json({ detail: 'unauthorized' }, 401);
		}
		if (url.pathname === '/api/projects' && method === 'GET') {
			return json(
				[...this.projects.values()].map((project) => ({
					id: project.id,
					name: project.name,
					rev: project.rev,
					updatedAt: project.updatedAt,
					deleted: project.deleted === true
				}))
			);
		}
		const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
		if (projectMatch) return this.#project(decodeURIComponent(projectMatch[1]), method, init);
		const photoMatch = /^\/api\/photos\/([^/]+)$/.exec(url.pathname);
		if (photoMatch) return this.#photo(photoMatch[1], method, init);
		return json({ detail: 'not found' }, 404);
	};

	async #project(id: string, method: string, init: RequestInit): Promise<Response> {
		if (method === 'GET') {
			const found = this.projects.get(id);
			return found ? json(found) : json({ detail: 'not found' }, 404);
		}
		if (this.failProjectPuts) return json({ detail: 'boom' }, 500);
		await this.beforePut?.(id);
		const current = this.projects.get(id);
		const body = JSON.parse(String(init.body)) as { baseRev: number; project: StoredProject };
		if (!current) {
			if (body.baseRev !== 0) return json({ detail: 'not found' }, 404);
		} else if (current.rev !== body.baseRev) {
			return json(current, 409);
		}
		const saved = { ...body.project, rev: (current?.rev ?? 0) + 1 };
		this.projects.set(id, saved);
		return json(saved);
	}

	async #photo(hash: string, method: string, init: RequestInit): Promise<Response> {
		if (method === 'HEAD') return new Response(null, { status: this.photos.has(hash) ? 200 : 404 });
		if (method === 'GET') {
			const blob = this.photos.get(hash);
			return blob ? new Response(blob, { status: 200 }) : json({ detail: 'not found' }, 404);
		}
		if (this.oversizedPhotos.has(hash)) return json({ detail: 'too large' }, 413);
		this.photos.set(hash, new Blob([init.body as Blob], { type: 'image/jpeg' }));
		return json({ hash }, 201);
	}
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
