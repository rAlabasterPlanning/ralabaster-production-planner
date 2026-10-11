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
  const body=await req.json(),locationState=String(body.location_state||'occupied'),category=String(body.category||''),shape=String(body.shape_type||''),locationNumber=Number(body.location_number);
  if(!Number.isInteger(locationNumber)||locationNumber<1||locationNumber>57)return json({error:'Kies een palletplek van 1 t/m 57.'},400);
  if(!['occupied','empty'].includes(locationState))return json({error:'Geef aan of de palletplek bezet of leeg is.'},400);
  if(locationState==='occupied'&&!['slab','raw','semi'].includes(category))return json({error:'Kies een voorraadsoort.'},400);
  const id=crypto.randomUUID(),stamp=new Date().toISOString().slice(0,10).replaceAll('-',''),prefix=category==='slab'?'PL':category==='raw'?'RM':'HF',stock_number=locationState==='empty'?null:`${prefix}-${stamp}-${id.slice(0,4).toUpperCase()}`;
  let photoPath:string|null=null;
  if(body.imageDataUrl){const match=String(body.imageDataUrl).match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i);if(!match)return json({error:'De foto heeft geen geldig formaat.'},400);const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>8*1024*1024)return json({error:'De foto is groter dan 8 MB.'},413);photoPath=`ralabaster/mobile/${id}/${Date.now()}.${match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase()}`;const upload=await admin.storage.from('inventory-photos').upload(photoPath,bytes,{contentType:`image/${match[1].toLowerCase()}`});if(upload.error)throw upload.error}
  if(locationState==='empty'){
   const checked=await admin.from('inventory_location_checks').upsert({workspace_id:link.workspace_id,location_number:locationNumber,location_state:'empty',item_id:null,photo_path:photoPath,notes:String(body.notes||''),checked_at:new Date().toISOString()},{onConflict:'workspace_id,location_number'});if(checked.error)throw checked.error;
   await admin.from('inventory_capture_links').update({last_used_at:new Date().toISOString()}).eq('id',link.id);
   return json({ok:true,location_state:'empty',location_number:locationNumber,stock_number:null});
  }
  const quantity=number(body.quantity)||0,unitWeight=number(body.unit_weight_kg),totalWeight=number(body.total_weight_kg),entryMode=String(body.weight_entry_mode||'calculated');
  const row={id,workspace_id:link.workspace_id,stock_number,category,shape_type:shape||null,description:String(body.description||''),material:'Alabaster',quantity,unit:'stuks',weight_entry_mode:['unit','total'].includes(entryMode)?entryMode:'calculated',unit_weight_kg:unitWeight,total_weight_kg:totalWeight,weight_kg:totalWeight,calculated_weight_kg:number(body.calculated_weight_kg),length_mm:number(body.length_mm),width_mm:number(body.width_mm),height_mm:number(body.height_mm),diameter_mm:number(body.diameter_mm),transparency_pct:number(body.transparency_pct),rack:'',shelf:'',position:String(locationNumber),photo_paths:photoPath?[photoPath]:[],notes:String(body.notes||''),density_kg_dm3:number(body.density_kg_dm3)||2.7,contour_dxf:String(body.contour_dxf||'')||null,capture_source:'mobile_link',status:quantity>0?'active':'depleted',updated_at:new Date().toISOString()};
  const saved=await admin.from('inventory_items').insert(row);if(saved.error)throw saved.error;
  const movement=await admin.from('inventory_movements').insert({item_id:id,movement_type:'opening',quantity_delta:row.quantity,balance_after:row.quantity,note:'Mobiele voorraadinvoer',photo_path:photoPath});if(movement.error)throw movement.error;
  const checked=await admin.from('inventory_location_checks').upsert({workspace_id:link.workspace_id,location_number:locationNumber,location_state:'occupied',item_id:id,photo_path:photoPath,notes:String(body.notes||''),checked_at:new Date().toISOString()},{onConflict:'workspace_id,location_number'});if(checked.error)throw checked.error;
  await admin.from('inventory_capture_links').update({last_used_at:new Date().toISOString()}).eq('id',link.id);
  return json({ok:true,id,stock_number,calculated_weight_kg:row.calculated_weight_kg});
 }catch(error){console.error(error);return json({error:'Opslaan is niet gelukt. Probeer het opnieuw of meld dit bij Ralph.'},500)}
});

