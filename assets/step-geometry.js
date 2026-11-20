/* rAlabaster STEP geometry reader — browser-side OpenCascade mesh import.
 * This returns measured mesh envelope bounds, never inferred CNC toolpaths.
 * File stays in the browser; STEP contents are not uploaded to AI.
 */
(function(root){
'use strict';
const AXES=['X','Y','Z'];
let enginePromise=null;
function finite(x){return typeof x==='number'&&Number.isFinite(x)}
function meshBounds(result){
 if(!result||!result.success||!Array.isArray(result.meshes)||!result.meshes.length)throw new Error('STEP-bestand bevat geen leesbare geometrie.');
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},vertices=[];
 let count=0;
 for(const mesh of result.meshes){
  const a=mesh?.attributes?.position?.array;
  if(!a||a.length%3!==0)throw new Error('Ongeldige punten in STEP-geometrie.');
  for(let i=0;i<a.length;i+=3){
   const p=[a[i],a[i+1],a[i+2]];
   if(!p.every(finite))throw new Error('Ongeldige coördinaten in STEP-model.');
   for(let j=0;j<3;j++){bounds.min[j]=Math.min(bounds.min[j],p[j]);bounds.max[j]=Math.max(bounds.max[j],p[j])}
   vertices.push(p);count++;
  }
 }
 if(count===0||count>4_000_000)throw new Error('STEP-geometrie is leeg of te omvangrijk.');
 return {bounds,vertices,meshCount:result.meshes.length,vertexCount:count};
}
function round(x){return Math.round(x*1000)/1000}
function orientation(info,axis='Z',face='max'){
 const k=AXES.indexOf(axis);
 if(k<0||!['min','max'].includes(face))throw new Error('Kies een geldige draaias en bewerkingszijde.');
 const radial=[0,1,2].filter(x=>x!==k);
 const middle=radial.map(x=>(info.bounds.max[x]+info.bounds.min[x])/2);
 const length=info.bounds.max[k]-info.bounds.min[k];
 if(!(length>0))throw new Error('Model heeft geen lengte langs deze as.');
 const diameter=2*Math.max(...info.vertices.map(p=>Math.hypot(p[radial[0]]-middle[0],p[radial[1]]-middle[1])));
 const selected=face==='min'?info.bounds.min[k]:info.bounds.max[k];
 const inward=face==='min'?1:-1;
 const radialWidths=radial.map(x=>info.bounds.max[x]-info.bounds.min[x]);
 if(!(diameter>0))throw new Error('Model heeft geen radiale afmetingen.');
 return {
  axis,face,faceCoordinateMm:round(selected),inwardDirection:inward>0?'+':'-',
  lengthMm:round(length),radialEnvelopeDiameterMm:round(diameter),
  axialMinMm:round(info.bounds.min[k]),axialMaxMm:round(info.bounds.max[k]),
  radialWidthsMm:radialWidths.map(round),
  centerMm:middle.map(round),
  mapZ:'Z_machine = -'+(face==='min'?'(A_model - '+round(selected)+')':'('+round(selected)+' - A_model)'),
  origin:'selected model '+axis+' '+face+' face, requires machining setup verification',
  warnings:[
   'Diameter is de radiale buitenomhullende van een getrianguleerd model, geen gegarandeerde nominale CAD-diameter.',
   'De middenas wordt voorlopig uit de bounding box bepaald; controleer of het onderdeel werkelijk rotatiesymmetrisch en concentrisch is.',
   'Wanddikte, boring, opspanning, radiale nulpunt en bereikbaarheid worden niet automatisch gevalideerd.'
  ]
 };
}
async function engine(){
 if(!enginePromise){
  enginePromise=(async()=>{
   if(typeof root.occtimportjs!=='function')throw new Error('STEP-importbibliotheek is niet geladen.');
   return await root.occtimportjs({locateFile:name=>'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/'+name});
  })().catch(err=>{enginePromise=null;throw err});
 }
 return enginePromise;
}
async function read(file){
 if(!file||!/\.(stp|step)$/i.test(file.name))throw new Error('Selecteer een STEP- of STP-bestand.');
 if(file.size>20_000_000)throw new Error('Maximaal 20 MB per STEP-bestand.');
 const occt=await engine();
 const bytes=new Uint8Array(await file.arrayBuffer());
 const imported=occt.ReadStepFile(bytes,{linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:0.08,angularDeflection:0.2});
 const info=meshBounds(imported);
 return {
  fileName:file.name,meshCount:info.meshCount,vertexCount:info.vertexCount,
  bounds:Object.fromEntries(AXES.map((name,i)=>[name,{min:round(info.bounds.min[i]),max:round(info.bounds.max[i]),size:round(info.bounds.max[i]-info.bounds.min[i])}])),
  orientation:(axis,face)=>orientation(info,axis,face)
 };
}
root.RALAB_STEP={read,meshBounds,orientation};
})(window);
