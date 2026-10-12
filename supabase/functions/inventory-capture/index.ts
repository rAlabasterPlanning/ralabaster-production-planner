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
  const body=await req.json(),action=String(body.action||'capture');
  if(action==='bootstrap'){
   const [stock,recounts,orders]=await Promise.all([
    admin.from('inventory_items').select('id,stock_number,description,category,quantity,unit,position,total_weight_kg,net_weight_kg,review_status').eq('workspace_id',link.workspace_id).neq('status','depleted').order('position'),
    admin.from('inventory_recounts').select('id,item_id,baseline_quantity,baseline_net_weight_kg,assigned_to,requested_at,inventory_items(stock_number,description,position,unit)').eq('workspace_id',link.workspace_id).eq('status','requested').order('requested_at'),
    admin.from('planner_orders_v2').select('order_id,order_no,active,status,data').eq('workspace_id',link.workspace_id).eq('deleted',false).limit(1000)
   ]);for(const x of [stock,recounts,orders])if(x.error)throw x.error;
   const openOrders=(orders.data||[]).map((x:any)=>({id:String(x.order_id),orderNo:x.order_no||'',active:x.active,status:x.status,...(x.data||{})})).filter((o:any)=>o.active!==false&&!['completed','cancelled','closed','done'].includes(String(o.status||'').toLowerCase())).map((o:any)=>({id:o.id,orderNo:o.orderNo||o.order_no||'',customerName:o.customerName||'',product:o.product||'',project:o.project||''})).sort((a:any,b:any)=>String(a.orderNo).localeCompare(String(b.orderNo)));
   return json({ok:true,items:stock.data||[],recounts:recounts.data||[],orders:openOrders,employees:['Ralph','Kaan','Lance','Shaffi','Peter']});
  }
  const uploadPhoto=async(prefix:string)=>{if(!body.imageDataUrl)return null;const match=String(body.imageDataUrl).match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i);if(!match)throw new Error('De foto heeft geen geldig formaat.');const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>8*1024*1024)throw new Error('De foto is groter dan 8 MB.');const path=`ralabaster/mobile/${prefix}/${Date.now()}.${match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase()}`,upload=await admin.storage.from('inventory-photos').upload(path,bytes,{contentType:`image/${match[1].toLowerCase()}`});if(upload.error)throw upload.error;return path};
  if(action==='complete_recount'){
   const photoPath=await uploadPhoto(`recount-${body.recount_id}`),result=await admin.rpc('inventory_complete_recount_internal',{p_recount_id:body.recount_id,p_quantity:number(body.quantity),p_gross_weight:number(body.gross_weight_kg),p_tare_weight:number(body.pallet_tare_kg),p_photo_path:photoPath||'',p_notes:String(body.notes||'')});if(result.error)throw result.error;return json({ok:true,balance:result.data});
  }
  if(action==='consume'){
   const orderRow=await admin.from('planner_orders_v2').select('order_id,active,status,data').eq('workspace_id',link.workspace_id).eq('order_id',String(body.order_id||'')).eq('deleted',false).maybeSingle();if(orderRow.error||!orderRow.data)return json({error:'Deze order is niet meer actief. Vernieuw de lijst.'},409);const o:any=orderRow.data.data||{};if(orderRow.data.active===false||['completed','cancelled','closed','done'].includes(String(orderRow.data.status||o.status||'').toLowerCase()))return json({error:'Deze order is niet meer actief.'},409);
   const result=await admin.rpc('inventory_staff_consume_internal',{p_item_id:body.item_id,p_order_id:String(orderRow.data.order_id),p_quantity:number(body.quantity),p_employee_name:String(body.employee_name||''),p_product_name:String(o.product||''),p_project_name:String(o.project||o.customerName||'')});if(result.error)throw result.error;return json({ok:true,balance:result.data});
  }
  const locationState=String(body.location_state||'occupied'),category=String(body.category||''),shape=String(body.shape_type||''),locationNumber=Number(body.location_number);
  if(!Number.isInteger(locationNumber)||locationNumber<1||locationNumber>57)return json({error:'Kies een palletplek van 1 t/m 57.'},400);
  if(!['occupied','empty'].includes(locationState))return json({error:'Geef aan of de palletplek bezet of leeg is.'},400);
  if(locationState==='occupied'&&!['slab','raw','semi'].includes(category))return json({error:'Kies een voorraadsoort.'},400);
  const id=crypto.randomUUID(),stamp=new Date().toISOString().slice(0,10).replaceAll('-',''),prefix=category==='slab'?'PL':category==='raw'?'RM':'HF',stock_number=locationState==='empty'?null:`${prefix}-${stamp}-${id.slice(0,4).toUpperCase()}`;
  const photoPath=await uploadPhoto(id);
  if(locationState==='empty'){
   const checked=await admin.from('inventory_location_checks').upsert({workspace_id:link.workspace_id,location_number:locationNumber,location_state:'empty',item_id:null,photo_path:photoPath,notes:String(body.notes||''),checked_at:new Date().toISOString()},{onConflict:'workspace_id,location_number'});if(checked.error)throw checked.error;
   await admin.from('inventory_capture_links').update({last_used_at:new Date().toISOString()}).eq('id',link.id);
   return json({ok:true,location_state:'empty',location_number:locationNumber,stock_number:null});
  }
  const quantity=number(body.quantity)||0,unitWeight=number(body.unit_weight_kg),totalWeight=number(body.total_weight_kg),grossWeight=number(body.gross_weight_kg),tareWeight=number(body.pallet_tare_kg)||0,entryMode=String(body.weight_entry_mode||'calculated');
  const priorResult=await admin.from('inventory_items').select('id,stock_number,category,shape_type,quantity,total_weight_kg,length_mm,width_mm,height_mm,diameter_mm,vein_pct').eq('workspace_id',link.workspace_id).eq('position',String(locationNumber)).neq('status','depleted').order('created_at',{ascending:false}).limit(1).maybeSingle();if(priorResult.error)throw priorResult.error;const prior:any=priorResult.data;
  const current:any={category,shape_type:shape||null,quantity,total_weight_kg:totalWeight,length_mm:number(body.length_mm),width_mm:number(body.width_mm),height_mm:number(body.height_mm),diameter_mm:number(body.diameter_mm),vein_pct:number(body.vein_pct)},differences:string[]=[];
  if(prior){if(prior.category!==current.category)differences.push(`Materiaalsoort wijkt af (${prior.category} → ${current.category})`);if(prior.shape_type&&current.shape_type&&prior.shape_type!==current.shape_type)differences.push(`Vorm wijkt af (${prior.shape_type} → ${current.shape_type})`);for(const [key,label] of [['diameter_mm','diameter'],['length_mm','lengte'],['width_mm','breedte'],['height_mm','dikte/hoogte']] as const){const a=Number(prior[key]),b=Number(current[key]);if(a>0&&b>0&&Math.abs(b-a)/a>.2)differences.push(`${label} wijkt ${Math.round(Math.abs(b-a)/a*100)}% af`)}if(Number(prior.quantity)>0&&Math.abs(quantity-Number(prior.quantity))/Number(prior.quantity)>.25)differences.push(`Aantal wijkt ${Math.round(Math.abs(quantity-Number(prior.quantity))/Number(prior.quantity)*100)}% af`);if(Number(prior.total_weight_kg)>0&&Number(totalWeight)>0&&Math.abs(Number(totalWeight)-Number(prior.total_weight_kg))/Number(prior.total_weight_kg)>.25)differences.push(`Gewicht wijkt ${Math.round(Math.abs(Number(totalWeight)-Number(prior.total_weight_kg))/Number(prior.total_weight_kg)*100)}% af`)}
  const comparisonStatus=!prior?'new':differences.length?'review':'matches',comparisonDetails={previous_stock_number:prior?.stock_number||null,previous_quantity:prior?.quantity??null,previous_weight_kg:prior?.total_weight_kg??null,differences};
  const row={id,workspace_id:link.workspace_id,stock_number,category,shape_type:shape||null,description:String(body.description||''),material:'Alabaster',quantity,unit:'stuks',weight_entry_mode:['unit','total'].includes(entryMode)?entryMode:'calculated',unit_weight_kg:unitWeight,total_weight_kg:totalWeight,weight_kg:totalWeight,gross_weight_kg:grossWeight,pallet_tare_kg:tareWeight,net_weight_kg:totalWeight,initial_quantity:quantity,initial_total_weight_kg:totalWeight,review_status:'pending',previous_item_id:prior?.id||null,comparison_status:comparisonStatus,comparison_details:comparisonDetails,calculated_weight_kg:number(body.calculated_weight_kg),length_mm:number(body.length_mm),width_mm:number(body.width_mm),height_mm:number(body.height_mm),diameter_mm:number(body.diameter_mm),transparency_pct:number(body.vein_pct),vein_pct:number(body.vein_pct),rack:'',shelf:'',position:String(locationNumber),photo_paths:photoPath?[photoPath]:[],notes:String(body.notes||''),density_kg_dm3:number(body.density_kg_dm3)||2.7,contour_dxf:String(body.contour_dxf||'')||null,capture_source:'mobile_link',status:quantity>0?'active':'depleted',updated_at:new Date().toISOString()};
  const saved=await admin.from('inventory_items').insert(row);if(saved.error)throw saved.error;
  const movement=await admin.from('inventory_movements').insert({item_id:id,movement_type:'opening',quantity_delta:row.quantity,balance_after:row.quantity,note:'Mobiele voorraadinvoer',photo_path:photoPath});if(movement.error)throw movement.error;
  const checked=await admin.from('inventory_location_checks').upsert({workspace_id:link.workspace_id,location_number:locationNumber,location_state:'occupied',item_id:id,photo_path:photoPath,notes:String(body.notes||''),checked_at:new Date().toISOString()},{onConflict:'workspace_id,location_number'});if(checked.error)throw checked.error;
  await admin.from('inventory_capture_links').update({last_used_at:new Date().toISOString()}).eq('id',link.id);
  return json({ok:true,id,stock_number,calculated_weight_kg:row.calculated_weight_kg});
 }catch(error){console.error('inventory-capture',error);const message=error instanceof Error?error.message:String((error as any)?.message||error);return json({error:`Opslaan is niet gelukt: ${message}`},500)}
});

