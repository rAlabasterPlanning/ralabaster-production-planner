/* Exact STEP B-Rep features using @tx-code/occt-js.
 * This is an independent verification layer. It never approves NC execution.
 */
(function(root){
'use strict';
const BASE='https://cdn.jsdelivr.net/npm/@tx-code/occt-js@0.1.7/dist/';
let promise;
function safe(x){return Number.isFinite(x)&&x>=0?Math.round(x*10000)/10000:null}
function collectExact(occt,result){
 if(!result?.success)throw new Error(result?.error||'STEP B-Rep kan niet worden ingelezen.');
 const id=result.exactModelId,geoms=result.geometries,bindings=result.exactGeometryBindings;
 if(!Number.isInteger(id)||!Array.isArray(geoms)||!Array.isArray(bindings))throw new Error('Exacte STEP-topologie is niet beschikbaar in deze CAD-engine.');
 const lookup=new Map(bindings.map(x=>[x.geometryId,x.exactShapeHandle]));
 const features=[],errors=[];let faces=0,edges=0,eligible=0;
 try{
 for(const g of geoms){
  const handle=lookup.get(g.id);
  if(!Number.isInteger(handle)){errors.push('Geen B-Rep-binding voor '+g.id);continue}
  for(const [kind,items] of [['face',g.faces],['edge',g.edges]]){
   for(const e of items||[]){
    const feature={geometry:g.id,kind,elementId:e.id};
    kind==='face'?faces++:edges++;
    let geo;try{geo=occt.GetExactGeometryType(id,handle,kind,e.id)}catch(err){errors.push('Geometriequery mislukt: '+err.message);continue}
    if(!geo?.ok){errors.push('Geen exacte geometrie voor '+kind+' '+e.id);continue}
    feature.geometryType=geo.family;eligible++;
    if(['circle','cylinder','sphere'].includes(geo.family)){
     const measured=occt.MeasureExactRadius(id,handle,kind,e.id);
     if(measured?.ok&&safe(measured.radius)!=null){feature.radiusMm=safe(measured.radius);feature.diameterMm=safe(measured.diameter);feature.axis=measured.localAxisDirection;feature.center=measured.localCenter}
    }
    if(kind==='face'&&geo.family==='plane'&&typeof occt.DescribeExactChamfer==='function'){
     let chamfer;try{chamfer=occt.DescribeExactChamfer(id,handle,kind,e.id)}catch(err){errors.push('Chamferquery: '+err.message)}
     if(chamfer?.ok){feature.chamfer={distanceAmm:safe(chamfer.distanceA),distanceBmm:safe(chamfer.distanceB),supportAngleRadians:safe(chamfer.supportAngle),variant:chamfer.variant}}
    }
    if(kind==='face'&&geo.family==='cylinder'&&typeof occt.DescribeExactHole==='function'){
     let hole;try{hole=occt.DescribeExactHole(id,handle,kind,e.id)}catch{}
     if(hole?.ok){feature.hole={diameterMm:safe(hole.diameter),depthMm:safe(hole.depth),through:hole.isThrough===true}}
    }
    if(feature.radiusMm!=null||feature.chamfer||feature.hole||['cone','torus'].includes(geo.family))features.push(feature);
   }
  }
 }
 }finally{if(typeof occt.ReleaseExactModel==='function')occt.ReleaseExactModel(id)}
 return {source:'exact-brep',features,counts:{faces,edges,eligible},warnings:errors.slice(0,15),fullyResolved:errors.length===0,profileValidated:false,exportAllowed:false};
}
async function load(){
 if(!promise)promise=(async()=>{
  const pkg=await import(BASE+'occt-js.mjs');
  const factory=pkg.default;
  if(typeof factory!=='function')throw new Error('Geen OpenCascade module gevonden.');
  const occt=await factory({locateFile:name=>BASE+name});
  if(typeof occt.OpenExactStepModel!=='function')throw new Error('Deze versie van de CAD-engine ondersteunt geen exacte STEP-geometrie.');
  return occt;
 })().catch(err=>{promise=null;throw err});
 return promise;
}
async function read(file){
 if(!file||!/\.(stp|step)$/i.test(file.name))throw new Error('Selecteer een STEP/STP-bestand.');
 if(file.size>15_000_000)throw new Error('STEP-bestand is groter dan 15 MB.');
 const occt=await load(),bytes=new Uint8Array(await file.arrayBuffer());
 const result=occt.OpenExactStepModel(bytes,{linearUnit:'millimeter'});
 return collectExact(occt,result);
}
root.RALAB_STEP_BREP={read,collectExact};
})(window);
