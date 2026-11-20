const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','assets','step-brep.js'),'utf8');
function reader(){const window={};vm.runInNewContext(source,{window});return window.RALAB_STEP_BREP;}
function fixture(){
 const occt={
  released:0,
  GetExactGeometryType(_m,_h,kind,id){return {ok:true,family:id===1?'cylinder':id===2?'plane':'circle'}},
  MeasureExactRadius(){return {ok:true,radius:30,diameter:60,localAxisDirection:[0,0,1],localCenter:[0,0,0]}},
  DescribeExactChamfer(){return {ok:true,distanceA:2,distanceB:2,variant:'equal-distance',supportAngle:Math.PI/2}},
  DescribeExactHole(){return {ok:false,code:'unsupported-geometry'}},
  ReleaseExactModel(){this.released++}
 };
 const model={success:true,exactModelId:7,geometries:[{id:'body',faces:[{id:1},{id:2}],edges:[{id:3}]}],exactGeometryBindings:[{geometryId:'body',exactShapeHandle:11}]};
 return {occt,model};
}
test('exact STEP radius and chamfer are separate candidates, not NC approved',()=>{
 const {occt,model}=fixture(),out=reader().collectExact(occt,model);
 assert.equal(out.features.find(x=>x.geometryType==='cylinder').radiusMm,30);
 assert.equal(out.features.find(x=>x.geometryType==='plane').chamfer.distanceAmm,2);
 assert.equal(out.features.find(x=>x.kind==='edge').radiusMm,30);
 assert.equal(out.exportAllowed,false);
 assert.equal(out.profileValidated,false);
 assert.equal(occt.released,1);
});
test('unknown geometry never becomes a guessed radius',()=>{
 const {occt,model}=fixture();
 occt.GetExactGeometryType=()=>({ok:false,code:'unknown'});
 const out=reader().collectExact(occt,model);
 assert.equal(out.features.length,0);
 assert.equal(out.fullyResolved,false);
 assert.ok(out.warnings.length);
 assert.equal(occt.released,1);
});
test('invalid B-Rep import is rejected',()=>{
 const {occt}=fixture();
 assert.throws(()=>reader().collectExact(occt,{success:false,error:'bad-step'}));
});
test('UI always requires human review and blocks machine export',()=>{
 const page=fs.readFileSync(path.join(__dirname,'..','cnc-programmer.html'),'utf8');
 assert.ok(page.includes('assets/step-brep.js'));
 assert.ok(page.includes('Exacte B-Rep-kandidaten'));
 assert.ok(page.includes('id="exportNC" disabled'));
 assert.ok(page.includes('Kruiscontrole PDF ↔ STEP'));
 assert.ok(page.includes('conflictsReviewed'));
});
