import { createServer, request } from 'node:http';

/** Development-only loopback ingress. The private header is never sent to the browser. */
export function localIngress(key, backendPort) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid local ingress key');
  const headers = req => {
    const values = {...req.headers};
    for (const name of Object.keys(values)) {
      if (name.startsWith('x-forwarded-') || ['forwarded','x-real-ip','x-dd-client-ip','x-dd-booking-ingress-key'].includes(name)) delete values[name];
    }
    values['x-dd-client-ip'] = req.socket.remoteAddress;
    values['x-dd-booking-ingress-key'] = key;
    return values;
  };
  const server = createServer((req, res) => {
    const upstream = request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:headers(req)}, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('Local booking backend unavailable'); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    const upstream = request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:headers(req)});
    upstream.on('upgrade', (response, peer, peerHead) => {
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` + Object.entries(response.headers).map(([k,v]) => `${k}: ${v}\r\n`).join('') + '\r\n');
      if (peerHead.length) socket.write(peerHead);
      if (head.length) peer.write(head);
      peer.on('error', () => socket.destroy()); socket.on('error', () => peer.destroy());
      socket.on('close', () => peer.destroy()); peer.on('close', () => socket.destroy());
      socket.pipe(peer); peer.pipe(socket);
    });
    upstream.on('response', () => { upstream.destroy(); socket.destroy(); });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.end();
  });
  return {server, close() { for (const socket of sockets) socket.destroy(); server.close(); }};
}
