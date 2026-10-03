import pg from 'pg';
declare const PROBE_ROLE:string;declare const PROBE_DATABASE_KEY:string;
const client=new pg.Client({connectionString:process.env[PROBE_DATABASE_KEY],connectionTimeoutMillis:5000,statement_timeout:5000});
try {
 await client.connect();
 const r=await client.query("SELECT current_user, has_schema_privilege(current_user,'public','CREATE') AS ddl");
 if(r.rows[0].current_user!==PROBE_ROLE || r.rows[0].ddl)throw Error('Role mismatch');
 console.log('PASS matching scoped runtime database role');
}catch {console.error('Database role probe failed');process.exitCode=1;}
finally {await client.end();}
