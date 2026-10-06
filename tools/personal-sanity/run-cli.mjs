import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
const root = resolve(import.meta.dirname, '../..');
const env = {...process.env, ...parseEnv(await readFile(resolve(root, 'apps/studio/.env.local'), 'utf8')), SANITY_CLI_NO_UPDATE_NOTIFIER: '1'};
if (!env.SANITY_AUTH_TOKEN) throw new Error('Missing project SANITY_AUTH_TOKEN');
const child = spawn(resolve(root, 'node_modules/.bin/sanity'), process.argv.slice(2), {cwd: resolve(root, 'apps/studio'), env, stdio: 'inherit'});
child.on('exit', code => {process.exitCode = code ?? 1;});
