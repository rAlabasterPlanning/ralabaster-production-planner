const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const filename=path.join(__dirname,'..','assets','step-geometry.js');
const source=fs.readFileSync(filename,'utf8');
function api(){const sandbox={window:{}};vm.runInNewContext(source,sandbox,{filename});return sandbox.window.RALAB_STEP}
function squarePrism(){
const positions=[];
for(const z of [0,30])for(const x of [-10,10])for(const y of [-5,5])positions.push(x,y,z);
return {success:true,meshes:[{attributes:{position:{array:positions}},index:{array:[]}}]};
}
test('STEP mesh envelope is measured and selectable on both axial faces',()=>{
 const cad=api(),model=cad.meshBounds(squarePrism());
 const a=cad.orientation(model,'Z','max'),b=cad.orientation(model,'Z','min');
 assert.equal(a.lengthMm,30);
 assert.equal(a.faceCoordinateMm,30);
 assert.equal(b.faceCoordinateMm,0);
 assert.equal(a.mapZ,'Z_machine = -(30 - A_model)');
 assert.equal(b.mapZ,'Z_machine = -(A_model - 0)');
 assert.equal(a.radialEnvelopeDiameterMm,22.361);
 assert.equal(a.warnings.length,3);
});
test('STEP axis may be X Y or Z, but not an arbitrary axis',()=>{
 const cad=api(),model=cad.meshBounds(squarePrism());
 assert.equal(cad.orientation(model,'X','min').lengthMm,20);
 assert.equal(cad.orientation(model,'Y','max').lengthMm,10);
 assert.throws(()=>cad.orientation(model,'W','min'));
});
test('Bad geometry is rejected rather than inventing measurements',()=>{
 const cad=api();
 assert.throws(()=>cad.meshBounds({success:false,meshes:[]}));
 assert.throws(()=>cad.meshBounds({success:true,meshes:[{attributes:{position:{array:[Infinity,0,1]}}}]}));
});
test('STEP side and axis review must be approved before code step',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','cnc-programmer.html'),'utf8');
 for(const item of ['id="stepAxis"','id="stepFace"','id="stepSideConfirmed"','assets/step-geometry.js','setStepOrientation','stepOrientation:stepInfo?'])assert.ok(html.includes(item),item);
 assert.ok(html.includes('stepSideConfirmed").checked&&!!stepOrientation'));
 assert.ok(html.includes('id="exportNC" disabled'));
});
