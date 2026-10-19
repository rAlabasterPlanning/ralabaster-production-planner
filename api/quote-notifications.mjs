import {timingSafeEqual} from 'node:crypto';
import {SUPABASE_URL} from './_planner-core.mjs';
export const config={maxDuration:300};
const email=s=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s||'');
export function settings(env=process.env){
 const c={tenant:env.MS_TENANT_ID,client:env.MS_CLIENT_ID,secret:env.MS_CLIENT_SECRET,sender:env.MS_SENDER_EMAIL,to:env.QUOTE_NOTIFICATION_TO,service:env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,cron:env.CRON_SECRET};
 if(!c.tenant||!c.client||!c.secret||!email(c.sender)||!email(c.to)||!c.service||!c.cron)throw Error('QUOTE_NOTIFICATIONS_NOT_CONFIGURED');
 if(env.VERCEL_ENV&&env.VERCEL_ENV!=='production')throw Error('QUOTE_NOTIFICATIONS_PRODUCTION_ONLY');
 return c;
}
function authorized(req,secret){const a=Buffer.from(req.headers.authorization||''),b=Buffer.from(`Bearer ${secret||''}`);return !!secret&&a.length===b.length&&timingSafeEqual(a,b)}
export function message(source,row,customer={}){
 const d=source==='portal'?row:row.data;
 return {subject:`Nieuwe offerteaanvraag · ${String(customer.company_name||d.company||'Klant').replace(/[\r\n]/g,' ').slice(0,150)}`,text:[
 'Er is een nieuwe offerteaanvraag ontvangen.',
 `Aanvraag: ${row.id}`,`Via: ${source==='portal'?'Klantportaal':'Acquisitie'}`,
 `Bedrijf: ${customer.company_name||d.company||''}`,`Contact: ${customer.contact_name||d.contact||''}`,
 `Product: ${d.product_name||'Maatwerkproduct'}`,`Omschrijving: ${d.description||''}`,
 `Aantal: ${d.quantity??'Nog niet opgegeven'} ${d.unit||''}`,`Afmetingen: ${d.dimensions||''}`,
 `Materiaal / afwerking: ${d.material||d.finish||''}`,`Gewenste datum: ${d.requested_delivery_date||'Nog niet opgegeven'}`,
 (d.attachment_path||d.file)?'Er is een bijlage; open deze in de planner.':'',
 'Bekijk en behandel de aanvraag in de planner → Nieuwe aanvragen.',
 'https://ralabasterplanner.vercel.app/'
 ].filter(Boolean).join('\n\n')};
}
export async function run(c,fetcher=fetch){
 async function rest(path,method='GET',body){const r=await fetcher(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{authorization:`Bearer ${c.service}`,apikey:c.service,'content-type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Notification database ${r.status}`);const t=await r.text();return t?JSON.parse(t):null}
 const update=(id,body)=>rest(`quote_request_notifications?id=eq.${id}`,'PATCH',body);
 let accepted=0,processed=0;
 for(let i=0;i<5;i++){
  const [job]=await rest('rpc/claim_quote_notification','POST',{});if(!job)break;processed++;
  let sending=false;
  try{
   const table=job.source==='portal'?'portal_product_requests':'acquisition_requests';
   const [row]=await rest(`${table}?id=eq.${job.request_id}&limit=1`);
   if(!row||(job.source==='portal'?row.request_type:row.kind)!=='quote'){await update(job.id,{status:'failed',last_error:'Offerteaanvraag bestaat niet meer.'});continue}
   let customer={};if(job.source==='portal'){[customer={}]=await rest(`portal_customers?customer_id=eq.${encodeURIComponent(row.customer_id)}&select=company_name,contact_name&limit=1`)}
   const token=await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client,client_secret:c.secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'}),signal:AbortSignal.timeout(15000)});
   if(!token.ok)throw Error(`Microsoft token ${token.status}`);const t=await token.json();if(!t.access_token)throw Error('Microsoft token ontbreekt');
   const m=message(job.source,row,customer);
   await update(job.id,{status:'sending',recipient:c.to});sending=true;
   const result=await fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.sender)}/sendMail`,{method:'POST',headers:{authorization:`Bearer ${t.access_token}`,'content-type':'application/json'},body:JSON.stringify({message:{subject:m.subject,body:{contentType:'Text',content:m.text},toRecipients:[{emailAddress:{address:c.to}}]},saveToSentItems:true}),signal:AbortSignal.timeout(20000)});
   if(result.status!==202)throw Error(`Microsoft sendMail ${result.status}`);
   await update(job.id,{status:'accepted',accepted_at:new Date().toISOString(),last_error:null});accepted++;
  }catch(e){
   // A timeout or post-send database failure may already have sent mail. Never resend blindly.
   await update(job.id,{status:sending?'needs_review':job.attempts>=5?'failed':'pending',last_error:String(e.message).slice(0,200),available_at:new Date(Date.now()+Math.min(60,2**job.attempts)*60000).toISOString()});
  }
 }
 return {processed,accepted};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false});
 if(!authorized(req,process.env.CRON_SECRET))return res.status(401).json({ok:false});
 let c;try{c=settings()}catch(e){return res.status(503).json({ok:false,code:e.message})}
 try{return res.json({ok:true,...await run(c)})}catch{console.error('Quote notification worker failed; inspect queue.');return res.status(500).json({ok:false,code:'QUOTE_NOTIFICATION_WORKER_FAILED'})}
}
