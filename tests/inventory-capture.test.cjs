const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('mobile inventory capture contains the six requested steps',()=>{
 const html=read('voorraad-invoer.html');
 for(const label of ['Plaat','Ruw materiaal','Half-fabricaat','Stellingplek','Aantal','Gewicht','Foto toevoegen'])assert.match(html,new RegExp(label));
 assert.match(html,/capture="environment"/);
});

test('weight is calculated from dimensions and alabaster density',()=>{
 const js=read('assets/inventory-capture.js');
 assert.match(js,/Math\.PI\*\(diameter\/2\)\*\*2\*height/);
 assert.match(js,/length\*width\*height/);
 assert.match(js,/mm3\/1e6\*2\.7/);
});

test('staff capture link is scoped and token protected',()=>{
 const sql=read('supabase/migrations/20261011185000_add_mobile_inventory_capture.sql'),fn=read('supabase/functions/inventory-capture/index.ts');
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/digest\(p_token,'sha256'\)/i);
 assert.match(fn,/x-inventory-token/);
 assert.match(fn,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(fn,/capture_source:'mobile_link'/);
});

test('photo analysis returns an explicitly approximate contour for DXF',()=>{
 const api=read('api/inventory-photo-analysis.mjs'),js=read('assets/inventory-capture.js');
 assert.match(api,/outlinePoints/);
 assert.match(api,/zonder te doen alsof deze maatvast is/);
 assert.match(js,/LWPOLYLINE/);
 assert.match(js,/STONE_CONTOUR/);
});
