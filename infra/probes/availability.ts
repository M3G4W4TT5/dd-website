import {getAvailability,todayInStudio} from '../../apps/booking/server/availability';
try {const value=await getAvailability(todayInStudio());if(value.source!=='pretix'||value.slots.length!==14)throw Error('Unexpected inventory');console.log('PASS matching booking availability parser: 14 fixture/hosted slots');}
catch {console.error('Booking availability probe failed');process.exitCode=1;}
// The standalone probe has no long-lived application lifecycle.
