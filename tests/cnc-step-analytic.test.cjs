const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','assets','step-analytic.js'),'utf8');
function parse(text){const sandbox={};vm.runInNewContext(src,sandbox);return sandbox.RALAB_STEP_ANALYTIC.parse(text)}
test('literal analytic radii are inventoried without claiming full chamfer recognition',()=>{
const step="ISO-10303-21; DATA; #10 = CYLINDRICAL_SURFACE('OUT',#20,50.); #11 = CIRCLE('R3',#30,3.); #12 = TOROIDAL_SURFACE('FILLET',#30,60.,4.); #13 = CONICAL_SURFACE('CHAMFER',#20,25.,0.785398); #14 = PLANE('BEVEL',#20); #15 = ADVANCED_FACE('',(#17),#12,.T.); ENDSEC; END-ISO-10303-21;";
const x=parse(step);
assert.equal(x.cylinders[0].radiusMm,50);
assert.equal(x.circles[0].radiusMm,3);
assert.equal(x.toruses[0].minorRadiusMm,4);
assert.equal(x.cones[0].semiAngleRadians,0.785398);
assert.equal(x.faceGeometry[0].surface,'#12');
assert.equal(x.completeFeatureRecognition,false);
assert.ok(x.warnings.some(w=>w.includes('Chamfers')));
});
test('non STEP input rejected',()=>assert.throws(()=>parse('garbage')));
test('wizard displays STEP candidates with appropriately withheld machine export',()=>{
const html=fs.readFileSync(path.join(__dirname,'..','cnc-programmer.html'),'utf8');
assert.ok(html.includes('assets/step-analytic.js'));
assert.ok(html.includes('Chamfers, fillets en contouren zijn nog niet via B-Rep-topologie geclassificeerd.'));
assert.ok(html.includes('id="exportNC" disabled'));
});
