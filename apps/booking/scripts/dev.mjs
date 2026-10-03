import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { localIngress } from './local-ingress.mjs';
const require = createRequire(import.meta.url);
if (process.env.NODE_ENV === 'production') throw new Error('Local ingress requires development mode');
process.env.NODE_ENV = 'development';
require('@next/env').loadEnvConfig(process.cwd(), true);
if (process.env.DD_MODE && process.env.DD_MODE !== 'development') throw new Error('Local ingress requires DD_MODE=development');
process.env.DD_MODE = 'development';
// Override any env-file key for this process pair; keep it private and ephemeral.
process.env.BOOKING_INGRESS_KEY = randomBytes(32).toString('hex');
const ingress = localIngress(process.env.BOOKING_INGRESS_KEY, 3001);
let child, stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  ingress.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => clearTimeout(timer));
  }
}
ingress.server.on('error', () => { console.error('Local booking ingress could not bind 127.0.0.1:3000'); process.exitCode = 1; stop(); });
ingress.server.listen(3000, '127.0.0.1', () => {
  child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3001'], {stdio:'inherit',env:process.env});
  child.on('error', () => { process.exitCode = 1; stop(); });
  child.on('exit', code => { process.exitCode = stopping ? 0 : (code || 1); stop(); });
  console.log('Booking browser URL: http://127.0.0.1:3000 (trusted local ingress)');
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => stop(signal));
