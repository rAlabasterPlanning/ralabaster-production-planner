import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-inventory-token,apikey,authorization'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const number=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Alleen POST is toegestaan.'},405);
 const token=req.headers.get('x-inventory-token')||'';
 if(token.length<32)return json({error:'Deze voorraadlink is ongeldig.'},401);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:link}=await admin.from('inventory_capture_links').select('id,workspace_id').eq('token_hash',await hash(token)).eq('active',true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle();
 if(!link)return json({error:'Deze voorraadlink is verlopen of ingetrokken.'},401);
 try{
  const body=await req.json(),category=String(body.category||''),shape=String(body.shape_type||'');
  if(!['slab','raw','semi'].includes(category))return json({error:'Kies een voorraadsoort.'},400);
  if(!String(body.location_number||'').trim())return json({error:'Vul de stellingplek in.'},400);
  const id=crypto.randomUUID(),stamp=new Date().toISOString().slice(0,10).replaceAll('-',''),prefix=category==='slab'?'PL':category==='raw'?'RM':'HF',stock_number=`${prefix}-${stamp}-${id.slice(0,4).toUpperCase()}`;
  let photoPath:string|null=null;
  if(body.imageDataUrl){const match=String(body.imageDataUrl).match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i);if(!match)return json({error:'De foto heeft geen geldig formaat.'},400);const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>8*1024*1024)return json({error:'De foto is groter dan 8 MB.'},413);photoPath=`ralabaster/mobile/${id}/${Date.now()}.${match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase()}`;const upload=await admin.storage.from('inventory-photos').upload(photoPath,bytes,{contentType:`image/${match[1].toLowerCase()}`});if(upload.error)throw upload.error}
  const row={id,workspace_id:link.workspace_id,stock_number,category,shape_type:shape||null,description:String(body.description||''),material:'Alabaster',quantity:number(body.quantity)||0,unit:'stuks',weight_kg:number(body.weight_kg),calculated_weight_kg:number(body.calculated_weight_kg),length_mm:number(body.length_mm),width_mm:number(body.width_mm),height_mm:number(body.height_mm),diameter_mm:number(body.diameter_mm),transparency_pct:number(body.transparency_pct),rack:'',shelf:'',position:String(body.location_number).trim(),photo_paths:photoPath?[photoPath]:[],notes:String(body.notes||''),density_kg_dm3:number(body.density_kg_dm3)||2.7,contour_dxf:String(body.contour_dxf||'')||null,capture_source:'mobile_link',status:(number(body.quantity)||0)>0?'active':'depleted',updated_at:new Date().toISOString()};
  const saved=await admin.from('inventory_items').insert(row);if(saved.error)throw saved.error;
  const movement=await admin.from('inventory_movements').insert({item_id:id,movement_type:'opening',quantity_delta:row.quantity,balance_after:row.quantity,note:'Mobiele voorraadinvoer',photo_path:photoPath});if(movement.error)throw movement.error;
  await admin.from('inventory_capture_links').update({last_used_at:new Date().toISOString()}).eq('id',link.id);
  return json({ok:true,id,stock_number,calculated_weight_kg:row.calculated_weight_kg});
 }catch(error){console.error(error);return json({error:'Opslaan is niet gelukt. Probeer het opnieuw of meld dit bij Ralph.'},500)}
});

