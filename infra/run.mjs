import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
// Explicit process file, no cross-app .env fallback; do not echo the environment.
const [file,...command]=process.argv.slice(2);
if(!file || !command.length)throw new Error('Usage: node infra/run.mjs private.env command args...');
const config=parseEnv(readFileSync(file,'utf8'));
const env={PATH:process.env.PATH,HOME:process.env.HOME,...config};
const child=spawn(command[0],command.slice(1),{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exitCode=code??1);
