import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', 'build');
const port = Number(process.env.PAGES_PORT ?? '4274');
const base = '/roomx/';

/** @type {Record<string, string>} */
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8',
	'.glb': 'model/gltf-binary'
};

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} file
 * @param {Record<string, string>} [extra]
 */
function send(res, status, file, extra = {}) {
	const type = types[extname(file)] ?? 'application/octet-stream';
	res.writeHead(status, {
		'content-type': type,
		'content-length': statSync(file).size,
		'cache-control': 'no-cache',
		...extra
	});
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	const path = decodeURIComponent(url.pathname);
	if (path === '/healthz') {
		res.writeHead(200).end('ok');
		return;
	}
	if (!path.startsWith(base)) {
		res.writeHead(path === '/' ? 302 : 404, path === '/' ? { location: base } : {}).end();
		return;
	}
	const target = resolve(root, '.' + sep + path.slice(base.length));
	if (target !== root && !target.startsWith(root + sep)) {
		res.writeHead(403).end();
		return;
	}
	let file = target;
	let status = 200;
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file) || !statSync(file).isFile()) {
		file = join(root, '404.html');
		status = 404;
	}
	if (!existsSync(file)) {
		res.writeHead(500).end('404.html missing');
		return;
	}
	/** @type {Record<string, string>} */
	const headers = file.endsWith('service-worker.js') ? { 'service-worker-allowed': base } : {};
	send(res, status, file, headers);
	if (req.method === 'HEAD') res.end();
	else createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1');
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
