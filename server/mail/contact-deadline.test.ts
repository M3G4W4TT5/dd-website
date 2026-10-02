import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:net';import {TLSSocket,createSecureContext} from 'node:tls';import {execFileSync,spawn} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('contact total deadline closes slow DATA socket without automatic resend',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dd-contact-smtp-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
 const ctx=createSecureContext({key:readFileSync(join(dir,'key.pem')),cert:readFileSync(join(dir,'cert.pem'))});
 let mode="accept";let sends=0,closed=false,trickle:ReturnType<typeof setInterval>|undefined;
 const sockets=new Set<any>();
 const server=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>{closed=true;sockets.delete(socket);clearInterval(trickle);});socket.write('220 fixture\r\n');
  function conversation(stream:any,secured:boolean){let data=false;stream.on('data',(chunk:Buffer)=>{
   const line=chunk.toString();if(data){if(line.includes('\r\n.\r\n')){sends++;if(mode==='accept'){data=false;stream.write('250 accepted\r\n');}else trickle=setInterval(()=>stream.write(' '),200);}return;}
   if(line.startsWith('EHLO'))stream.write(secured?'250-fixture\r\n250 AUTH PLAIN\r\n':'250-fixture\r\n250 STARTTLS\r\n');
   else if(line.startsWith('STARTTLS')){stream.removeAllListeners('data');stream.write('220 TLS\r\n');const tls=new TLSSocket(socket,{isServer:true,secureContext:ctx});tls.on('error',()=>{});conversation(tls,true);}
   else if(line.startsWith('AUTH'))stream.write('235 accepted\r\n');
   else if(line.startsWith('MAIL')||line.startsWith('RCPT'))stream.write('250 accepted\r\n');
   else if(line.startsWith('QUIT')){stream.write('221 bye\r\n');stream.end();}
   else if(line.startsWith('DATA')){data=true;stream.write('354 body\r\n');}
  });}conversation(socket,false);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;
 try{
  const code=`import {createMailer,DeliveryError} from './server/mail/index.ts';const send=createMailer({mode:'production',delivery:'controlled',allowlist:['fixture@example.invalid'],host:'localhost',port:${port},user:'fixture',password:'synthetic'},'booking');try{await send('inquiry',{to:'fixture@example.invalid',subject:'Fixture',text:'Synthetic body'});process.exit(2);}catch(e){if(!(e instanceof DeliveryError)||e.state!=='ambiguous'){console.log(e.name,e.state);process.exit(3);}}`;
  async function run(){const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...process.env,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem')},stdio:['ignore','pipe','ignore']});let diagnostic='';child.stdout!.on('data',c=>diagnostic+=c);
  const result=await new Promise<number|null>(r=>child.on('exit',r));return {result,diagnostic};}
  assert.equal((await run()).result,2,'legitimate TLS inquiry accepted');mode='hang';closed=false;const hung=await run();assert.equal(hung.result,0,hung.diagnostic);assert.equal(sends,2);assert.equal(closed,true);
 }finally{clearInterval(trickle);for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
