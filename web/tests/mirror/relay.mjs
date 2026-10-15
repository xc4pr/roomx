// @ts-nocheck: plain Node script, the ws package ships no types
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

function matches(filter, event) {
	if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
	if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
	if (typeof filter.until === 'number' && event.created_at > filter.until) return false;
	for (const [key, values] of Object.entries(filter)) {
		if (!key.startsWith('#') || !Array.isArray(values)) continue;
		const name = key.slice(1);
		const tagged = (event.tags ?? []).some((tag) => tag[0] === name && values.includes(tag[1]));
		if (!tagged) return false;
	}
	return true;
}

export function startRelay(port = Number(process.env.MIRROR_RELAY_PORT ?? 4275)) {
	const stats = new Map();
	const agentOf = (header) =>
		/Chrome|Chromium/.test(header ?? '')
			? 'chromium'
			: /AppleWebKit/.test(header ?? '')
				? 'webkit'
				: 'other';
	const counters = (agent) => {
		if (!stats.has(agent)) stats.set(agent, { connections: 0, events: 0 });
		return stats.get(agent);
	};
	const snapshot = (agent) => {
		const total = { connections: 0, events: 0, open: 0 };
		for (const [name, value] of stats) {
			if (agent && name !== agent) continue;
			total.connections += value.connections;
			total.events += value.events;
		}
		for (const socket of subscriptions.keys()) {
			if (!agent || socket.agent === agent) total.open++;
		}
		return total;
	};
	const http = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const agent = url.searchParams.get('agent') ?? undefined;
		if (url.pathname === '/healthz') {
			res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
		} else if (url.pathname === '/stats') {
			res
				.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
				.end(JSON.stringify(snapshot(agent)));
		} else if (url.pathname === '/reset') {
			if (agent) stats.delete(agent);
			else stats.clear();
			res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
		} else {
			res.writeHead(404).end();
		}
	});
	const server = new WebSocketServer({ server: http });
	const subscriptions = new Map();
	http.listen(port, '127.0.0.1');

	server.on('connection', (socket, request) => {
		socket.agent = agentOf(request.headers['user-agent']);
		counters(socket.agent).connections++;
		const own = new Map();
		subscriptions.set(socket, own);
		socket.on('message', (raw) => {
			let message;
			try {
				message = JSON.parse(raw.toString());
			} catch {
				return;
			}
			if (!Array.isArray(message)) return;
			const [type, first, ...rest] = message;
			if (type === 'REQ' && typeof first === 'string') {
				own.set(first, rest);
				socket.send(JSON.stringify(['EOSE', first]));
			} else if (type === 'CLOSE' && typeof first === 'string') {
				own.delete(first);
			} else if (type === 'EVENT' && first && typeof first === 'object') {
				counters(socket.agent).events++;
				socket.send(JSON.stringify(['OK', first.id, true, '']));
				for (const [peer, subs] of subscriptions) {
					if (peer.readyState !== peer.OPEN) continue;
					for (const [subId, filters] of subs) {
						if (filters.some((filter) => matches(filter, first))) {
							peer.send(JSON.stringify(['EVENT', subId, first]));
						}
					}
				}
			}
		});
		socket.on('close', () => subscriptions.delete(socket));
		socket.on('error', () => socket.terminate());
	});

	return {
		port,
		close: () =>
			new Promise((done) => {
				for (const client of server.clients) client.terminate();
				server.close(() => http.close(() => done()));
				http.closeAllConnections();
			})
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const relay = startRelay();
	console.log(`mirror relay on ws://127.0.0.1:${relay.port}`);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => void relay.close().then(() => process.exit(0)));
	}
}
