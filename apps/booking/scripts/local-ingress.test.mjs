import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { localIngress } from './local-ingress.mjs';
import { bookingClient } from '../server/client-identity.ts';

test('loopback ingress replaces spoofed identity, rejects direct access and transports HMR upgrades', async () => {
  const key = 'a'.repeat(64);
  process.env.BOOKING_INGRESS_KEY = key;
  const backend = createServer((req,res) => {
    try {
      const client = bookingClient(new Request('http://127.0.0.1'+req.url,{headers:req.headers}));
      res.end(JSON.stringify({client,forwarded:req.headers['x-forwarded-for'] || null}));
    } catch (e) { res.writeHead(e.status || 503); res.end('Denied'); }
  });
  backend.on('upgrade', (req,socket) => {
    assert.equal(req.headers['x-dd-client-ip'],'127.0.0.1');
    assert.equal(req.headers['x-dd-booking-ingress-key'],key);
    const accept = createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    socket.write(Buffer.from([0x81,4,...Buffer.from('pong')]));
    socket.on('data', () => socket.end());
  });
  backend.listen(0,'127.0.0.1'); await once(backend,'listening');
  const port = backend.address().port;
  const ingress = localIngress(key,port);
  ingress.server.listen(0,'127.0.0.1'); await once(ingress.server,'listening');
  const publicPort = ingress.server.address().port;
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`,{headers:{'x-dd-booking-ingress-key':'b'.repeat(64),'x-dd-client-ip':'192.0.2.9'}})).status,403);
    const response = await fetch(`http://127.0.0.1:${publicPort}/`,{headers:{'x-dd-booking-ingress-key':'wrong','x-dd-client-ip':'192.0.2.9','x-forwarded-for':'192.0.2.9'}});
    assert.equal(response.status,200);
    const raw = await response.text();
    assert.ok(!raw.includes(key));
    assert.deepEqual(JSON.parse(raw),{client:{address:'127.0.0.1',prefix:'127.0.0.0/24'},forwarded:null});
    const websocket = new WebSocket(`ws://127.0.0.1:${publicPort}/_next/webpack-hmr`);
    const message = await once(websocket,'message');
    assert.equal(message[0].data,'pong');
    websocket.close();
  } finally { ingress.close(); backend.closeAllConnections(); backend.close(); }
});

test('dev launcher rejects production mode before starting a proxy or backend', () => {
  for (const override of [{NODE_ENV:'production'},{NODE_ENV:'development',DD_MODE:'production'}]) {
    const result = spawnSync(process.execPath,['scripts/dev.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,...override},encoding:'utf8',timeout:10000});
    assert.equal(result.status,1);
    assert.match(result.stderr,/requires.*development/);
    assert.ok(!result.stdout.includes('Booking browser URL'));
  }
});
