const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('mobile inventory capture contains the six requested steps',()=>{
 const html=read('voorraad-invoer.html');
 for(const label of ['Plaat','Ruw materiaal','Half-fabricaat','Palletplek','Aantal','Gewicht','Foto toevoegen'])assert.match(html,new RegExp(label));
 assert.match(html,/capture="environment"/);
});

test('mobile capture is a one-step-at-a-time wizard with simple measurements',()=>{
 const js=read('assets/inventory-capture.js');
 assert.match(js,/function setupWizard/);
 assert.match(js,/Stap \$\{currentStep\} van 6/);
 assert.match(js,/Volgende →/);
 assert.match(js,/Dikte \(mm\)/);
 assert.doesNotMatch(js,/Dikte \/ lengte/);
 for(const label of ['Langste maat','Middelste maat','Kleinste maat'])assert.match(js,new RegExp(label));
 assert.match(js,/grayscale\(1\) invert\(1\)/);
});

test('weight is calculated from dimensions and alabaster density',()=>{
 const js=read('assets/inventory-capture.js'),html=read('voorraad-invoer.html');
 assert.match(js,/Math\.PI\*\(diameter\/2\)\*\*2\*height/);
 assert.match(js,/length\*width\*height/);
 assert.match(js,/mm3\/1e6\*2\.7/);
 assert.match(html,/Ik weeg 1 steen/);
 assert.match(html,/hele pallet \/ partij/);
 assert.match(js,/totalWeight/);
 assert.match(js,/entered\*quantity/);
});

test('all 57 pallet positions can be marked occupied, empty or not counted',()=>{
 const html=read('voorraad-invoer.html'),capture=read('assets/inventory-capture.js'),inventory=read('assets/inventory-v1.js'),sql=read('supabase/migrations/20261011191500_inventory_counting_and_order_reservations.sql');
 assert.match(html,/Nummer 1 t\/m 57/);
 assert.match(html,/Deze plek is leeg/);
 assert.match(capture,/location_state/);
 assert.match(inventory,/Controle palletplekken 1 t\/m 57/);
 assert.match(inventory,/nog niet geteld/);
 assert.match(sql,/inventory_location_checks/);
});

test('planner shows recent photographed stock and reserves it for orders',()=>{
 const inventory=read('assets/inventory-v1.js'),sql=read('supabase/migrations/20261011191500_inventory_counting_and_order_reservations.sql');
 assert.match(inventory,/Nieuw ingevoerde voorraad/);
 assert.match(inventory,/createSignedUrls/);
 assert.match(inventory,/Aan order koppelen/);
 assert.match(inventory,/inventory_reserve_for_order/);
 assert.match(sql,/for update/i);
 assert.match(sql,/movement_type,quantity_delta,balance_after,order_id/);
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
 assert.match(api,/Output\.object/);
 assert.match(api,/A4 of rechthoekig vel/);
 assert.match(js,/LWPOLYLINE/);
 assert.match(js,/STONE_CONTOUR/);
});

test('inventory uses veins, pallet tare and a review-before-accept workflow',()=>{
 const html=read('voorraad-invoer.html'),capture=read('assets/inventory-capture.js'),review=read('assets/inventory-review-v1.js'),ops=read('assets/inventory-capture-operations-v1.js'),sql=read('supabase/migrations/20261011195500_inventory_review_staff_movements_and_portal_preferences.sql');
 assert.match(capture,/Aders \(%\)/);
 assert.doesNotMatch(capture,/Transparant \(%\)/);
 assert.match(html,/Gewicht lege pallet/);
 assert.match(capture,/entered-tare/);
 assert.match(review,/Steekproef aanvragen/);
 assert.match(review,/Gecontroleerde verschillen/);
 assert.match(review,/Verwijderen \/ afboeken/);
 assert.match(ops,/Steen pakken voor order/);
 assert.match(sql,/inventory_staff_consume_internal/);
 assert.match(sql,/review_status:'pending'|review_status text/);
});
