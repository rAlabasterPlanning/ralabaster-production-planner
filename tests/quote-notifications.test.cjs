const {test}=require('node:test'),assert=require('node:assert/strict');
const c={tenant:'tenant',client:'client',secret:'secret',sender:'sender@example.test',to:'ralph@example.test',service:'service',cron:'cron'};
function fixture({sendError=false,tokenError=false,acceptedWriteError=false}={}){
 const job={id:'job',source:'portal',request_id:'request',attempts:1},patches=[],sent=[];let claimed=false;
 const fetcher=async(url,o={})=>{
  if(url.includes('/token'))return new Response(JSON.stringify({access_token:'token'}),{status:tokenError?401:200});
  if(url.includes('/sendMail')){sent.push(JSON.parse(o.body));if(sendError)throw Error('timeout');return new Response(null,{status:202})}
  if(o.method==='PATCH'){const p=JSON.parse(o.body);patches.push(p);if(acceptedWriteError&&p.status==='accepted')throw Error('database timeout');return new Response('[]')}
  if(url.includes('claim_quote_notification')){const r=claimed?[]:[job];claimed=true;return new Response(JSON.stringify(r))}
  if(url.includes('/portal_product_requests'))return new Response(JSON.stringify([{id:'request',request_type:'quote',customer_id:'customer',product_name:'Lamp',description:'Please quote',quantity:10}]));
  if(url.includes('/portal_customers'))return new Response(JSON.stringify([{company_name:'Customer'}]));
  throw Error('Unexpected request '+url);
 };return {fetcher,patches,sent};
}
test('new persisted quote sends only to configured Ralph recipient, then records acceptance',async()=>{
 const {run}=await import('../api/quote-notifications.mjs'),f=fixture();assert.deepEqual(await run(c,f.fetcher),{processed:1,accepted:1});assert.equal(f.sent.length,1);assert.equal(f.sent[0].message.toRecipients[0].emailAddress.address,c.to);assert.match(f.sent[0].message.body.content,/Nieuwe aanvragen/);assert.deepEqual(f.patches.map(x=>x.status),['sending','accepted']);
});
test('uncertain send and post-send persistence failure require review, never automatic resend',async()=>{
 const {run}=await import('../api/quote-notifications.mjs');for(const options of [{sendError:true},{acceptedWriteError:true}]){const f=fixture(options);await run(c,f.fetcher);assert.equal(f.sent.length,1);assert.equal(f.patches.at(-1).status,'needs_review')}
});
test('token failure retries without sending',async()=>{const {run}=await import('../api/quote-notifications.mjs'),f=fixture({tokenError:true});await run(c,f.fetcher);assert.equal(f.sent.length,0);assert.equal(f.patches.at(-1).status,'pending')});
test('missing credentials and preview execution are blocked; caller cannot choose recipient',async()=>{
 const {settings,default:handler}=await import('../api/quote-notifications.mjs');assert.throws(()=>settings({}),/NOT_CONFIGURED/);
 const env={MS_TENANT_ID:c.tenant,MS_CLIENT_ID:c.client,MS_CLIENT_SECRET:c.secret,MS_SENDER_EMAIL:c.sender,QUOTE_NOTIFICATION_TO:c.to,SUPABASE_SERVICE_ROLE_KEY:c.service,CRON_SECRET:c.cron,VERCEL_ENV:'preview'};assert.throws(()=>settings(env),/PRODUCTION_ONLY/);
 let status;const res={setHeader(){},status(s){status=s;return this},json(x){return x}};await handler({method:'POST',headers:{},body:{to:'attacker@example.test'}},res);assert.equal(status,401);
});
