import {createCapture} from '../../server/mail/capture';
const store=createCapture('/capture');
try {await store({},Buffer.from('Synthetic private capture check'));await store.prune();console.log('PASS private capture');}
catch {console.error('Capture probe failed');process.exitCode=1;}
finally {store.close();}
