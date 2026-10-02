import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { admission, budget, clientIdentity, privateKey, setting, AdmissionDenied } from "./admission";

/** Only keyed counters and expiring lease UUIDs are stored. Inquiry content stays in memory. */
export function contactAdmission(pool:Pool,key:string,client:ReturnType<typeof clientIdentity>) {
  if(clientIdentity(client.address).prefix!==client.prefix) throw new Error("Invalid contact client");
  async function reserve(kind:"inquiry"|"acknowledgement",email?:string) {
    const id=randomUUID(),lane="contact-"+kind;
    await admission(pool,lane,async c=>{
      await c.query("DELETE FROM admission_leases WHERE lane=$1 AND expires_at<=clock_timestamp()",[lane]);
      const count=await c.query<{n:string}>("SELECT count(*) n FROM admission_leases WHERE lane=$1",[lane]);
      if(Number(count.rows[0].n)>=setting(kind==="inquiry"?"CONTACT_INQUIRY_CONCURRENCY":"CONTACT_ACK_CONCURRENCY",kind==="inquiry"?2:1,8)) throw new AdmissionDenied("capacity",30);
      if(kind==="inquiry") {
        await budget(c,privateKey(key,lane+"-client",client.address),setting("CONTACT_CLIENT_HOURLY",3),3600);
        await budget(c,privateKey(key,lane+"-prefix",client.prefix),setting("CONTACT_PREFIX_HOURLY",30),3600);
      } else {
        if(!email)throw new Error("Acknowledgement identity missing");
        await budget(c,privateKey(key,lane+"-email",email.trim().toLowerCase()),1,3600);
      }
      await budget(c,privateKey(key,lane,"site"),setting(kind==="inquiry"?"CONTACT_INQUIRY_HOURLY":"CONTACT_ACK_HOURLY",30),3600,"capacity");
      // Fixed 6s cancellable contact SMTP deadline, plus acquisition/cleanup margin.
      await c.query("INSERT INTO admission_leases(id,lane,expires_at) VALUES($1,$2,clock_timestamp()+interval '30 seconds')",[id,lane]);
    });
    return async()=>{try {await admission(pool,lane+"-release",c=>c.query("DELETE FROM admission_leases WHERE id=$1",[id]));}catch {console.error("Contact lease cleanup unavailable; lease expires");}};
  }
  return {inquiry:()=>reserve("inquiry"),acknowledgement:async(email:string)=>{
    try{return await reserve("acknowledgement",email);}catch(e){if(e instanceof AdmissionDenied)return undefined;throw e;}
  }};
}
