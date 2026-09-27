import { bookingDb } from '../../../../server/notifications';
export const runtime='nodejs';
export async function GET(){try{await bookingDb().query('SELECT 1');return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}}
