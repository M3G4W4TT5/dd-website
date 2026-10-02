import {communicationsConfig} from '../../server/runtime/config';
import {validateBooking,validateWorker} from '../../apps/booking/server/config';
// Replaced at compile time separately for each final image.
declare const PROBE_SERVICE:string;
try {
 if(PROBE_SERVICE==='booking')validateBooking(process.env);
 else if(PROBE_SERVICE==='worker')validateWorker(process.env);
 else if(PROBE_SERVICE==='communications')communicationsConfig(process.env,'booking');
 else throw Error('Unknown probe service');
 console.log('PASS matching runtime configuration');
}catch {console.error('Runtime configuration probe failed');process.exitCode=1;}
