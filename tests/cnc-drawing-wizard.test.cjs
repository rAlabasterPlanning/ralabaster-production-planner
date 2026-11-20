const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const page=fs.readFileSync(path.join(__dirname,'..','cnc-programmer.html'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','api','cnc-drawing-analysis.mjs'),'utf8');
test('wizard includes five stages in correct order',()=>{
 const items=['Tekening of STEP uploaden','Geïnterpreteerde maten verifiëren','Bewerkingen controleren','Basisgegevens en stock','Volledige G-code controleren'];
 let pos=-1;
 for(const item of items){const at=page.indexOf(item);assert.ok(at>pos,item+' missing or out of order');pos=at}
});
test('AI drawing endpoint requires authentication and restricts file types and sizes',()=>{
 for(const s of ['authenticatedUser(tokenFrom(req))','MAX_FILE_BYTES=2_500_000','application/pdf','image/png','image/jpeg','image/webp','status:\'unverified\'','exportAllowed:false']) assert.ok(api.includes(s),s);
});
test('confidence and missing dimension do not become production-ready numbers',()=>{
 assert.ok(api.includes("val.confidence<0.6"));
 assert.ok(api.includes("val.origin==='unknown'"));
 assert.ok(api.includes("value:null"));
});
test('downstream approval gated and NC export disabled',()=>{
 assert.match(page,/id="exportNC" disabled/);
 assert.match(page,/if\(i===1\)return !!drawingAnalysis&&geometricallyValid\(\)&&\$\("dimensionsVerified"\)\.checked/);
 assert.match(page,/if\(i===2\)return !!drawingAnalysis&&operationList\.some/);
 assert.match(page,/resetDownstream\(1\)/);
});
test('step and DXF are not quietly treated as interpreted geometry',()=>{
 assert.ok(page.includes('STEP wordt lokaal als driehoeksgeometrie doorgemeten'));
 assert.ok(api.includes('STEP en DXF vereisen een aparte geometrielezer'));
});
test('wizard JS is syntactically valid',()=>{
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'page inline script missing');
 new (require('node:vm').Script)(script);
});
