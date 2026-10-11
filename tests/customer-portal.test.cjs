const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('customer portal exposes the complete customer flow',()=>{
 const html=read('portal.html'),js=read('assets/customer-portal.js');
 for(const label of ['Producten','Bestellingen','Offertes','Nieuw product'])assert.match(html,new RegExp(label));
 for(const rpc of ['portal_place_order','portal_request_product','portal_quote_decision'])assert.match(js,new RegExp(rpc));
 assert.match(js,/portal_customer_users/);
 assert.match(js,/portal_order_lines/);
 assert.match(js,/portal_request_order_change/);
});

test('portal invitation and recovery lead to password creation',()=>{
 const html=read('portal.html'),js=read('assets/customer-portal.js'),admin=read('supabase/functions/portal-admin/index.ts');
 assert.match(html,/Maak uw wachtwoord aan/);
 assert.match(html,/Wachtwoord instellen of vergeten/);
 assert.match(js,/resetPasswordForEmail/);
 assert.match(js,/PASSWORD_RECOVERY/);
 assert.match(js,/updateUser\(\{password\}\)/);
 assert.match(js,/shouldCreateUser:false/);
 assert.match(admin,/portal\?mode=password/);
 assert.match(js,/authMode='';[\s\S]*updateUser\(\{password\}\)/);
});

test('planner and customer portal use separate browser sessions',()=>{
 const portal=read('assets/customer-portal.js'),admin=read('assets/admin-auth.js');
 assert.match(portal,/storageKey:'ralabaster-customer-auth-v1'/);
 assert.match(admin,/storageKey:'ralabaster-planner-auth-v1'/);
});

test('portal follows the rAlabaster document style and hides inactive screens',()=>{
 const css=read('assets/customer-portal.css'),html=read('portal.html');
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(css,/--ink:#292c31/);
 assert.doesNotMatch(css,/images\.unsplash\.com|--green:/);
 assert.match(html,/Natural stone\./);
});

test('order change requests are isolated and submitted through a secured rpc',()=>{
 const sql=read('supabase/migrations/20261007150000_portal_order_change_requests.sql'),js=read('assets/customer-portal.js'),admin=read('assets/customer-portal-admin-v1.js');
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/customer_id=public\.portal_current_customer_id\(\)/i);
 assert.match(sql,/security definer/i);
 assert.match(sql,/status not in \('completed','cancelled'\)/i);
 assert.match(js,/Wijziging aanvragen/);
 assert.match(admin,/portal_order_change_requests/);
 assert.match(admin,/data-portal-pending-changes/);
 assert.match(admin,/Opslaan en klant informeren/);
 assert.match(admin,/admin_response/);
});

test('portal migration isolates customers and protects internal planner data',()=>{
 const sql=read('supabase/migrations/20261007065926_customer_portal.sql');
 assert.match(sql,/alter table public\.portal_products enable row level security/i);
 assert.match(sql,/customer_id=public\.portal_current_customer_id\(\)/i);
 assert.match(sql,/planner_orders_admin_select[\s\S]*portal_is_admin\(\)/i);
 assert.match(sql,/storage\.foldername\(name\)/i);
 assert.match(sql,/security definer[\s\S]*portal_place_order|portal_place_order[\s\S]*security definer/i);
});

test('planner contains portal management and role gate',()=>{
 const html=read('index.html'),admin=read('assets/customer-portal-admin-v1.js'),auth=read('assets/admin-auth.js');
 assert.match(html,/data-view="portaladmin"/);
 assert.match(admin,/Ontbrekend product koppelen/);
 assert.match(admin,/data-portal-convert/);
 assert.match(auth,/requirePlannerAdmin/);
 assert.match(auth,/CUSTOMER_SESSION/);
 assert.match(auth,/await client\.auth\.signOut\(\)/);
});

test('planner lets staff review customer products one customer at a time',()=>{
 const html=read('index.html'),admin=read('assets/customer-portal-admin-v1.js');
 assert.match(html,/price-history-1/);
 assert.match(admin,/Controlelijst/);
 assert.match(admin,/Klopt · volgende klant/);
 assert.match(admin,/data-portal-save-product/);
 assert.match(admin,/Ontkoppelen/);
 assert.match(admin,/Nog niet gekoppelde producten/);
 assert.match(admin,/replace\(','\s*,\s*'\.'\)/);
});

test('portal product linking recovers customer prices from commercial history',()=>{
 const admin=read('assets/customer-portal-admin-v1.js');
 assert.match(admin,/planner_orders_v2/);
 assert.match(admin,/function inferredPrice/);
 assert.match(admin,/laatste order/);
 assert.match(admin,/laatste offerte/);
 assert.match(admin,/backfillMissingProductPrices/);
 assert.match(admin,/Omschrijving in klantportaal/);
 assert.match(admin,/interne productnotities worden niet automatisch getoond/);
 assert.doesNotMatch(admin,/t\.notes\|\|t\.material/);
});
