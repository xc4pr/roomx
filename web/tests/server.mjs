import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const port = process.env.PW_PORT ?? '4273';
const data = mkdtempSync(join(tmpdir(), 'roomx-e2e-'));

const child = spawn(
	join(root, 'server/.venv/bin/uvicorn'),
	['app.main:app', '--port', port, '--log-level', 'warning'],
	{
		cwd: join(root, 'server'),
		stdio: 'inherit',
		env: {
			...process.env,
			ROOMX_TOKEN: 'e2e-token',
			ROOMX_DATA: data,
			ROOMX_STATIC: join(root, 'web/build')
		}
	}
);

const stop = () => child.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
