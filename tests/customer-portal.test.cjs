const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('customer portal exposes the complete customer flow',()=>{
 const html=read('portal.html'),js=read('assets/customer-portal.js');
 for(const label of ['Producten','Bestellingen','Offertes','Nieuwe offerte','Nieuwe bestelling'])assert.match(html,new RegExp(label));
 for(const rpc of ['portal_place_order','portal_request_new_product','portal_quote_decision'])assert.match(js,new RegExp(rpc));
 assert.match(js,/portal_customer_users/);
 assert.match(js,/portal_order_lines/);
 assert.match(js,/portal_request_order_change/);
});

test('customers can save language, document recipients and delivery preferences',()=>{
 const html=read('portal.html'),js=read('assets/customer-portal.js'),sql=read('supabase/migrations/20261011195500_inventory_review_staff_movements_and_portal_preferences.sql');
 assert.match(html,/data-view="preferences"/);
 for(const name of ['invoice_email','packing_slip_email','order_confirmation_email','logistics_email','delivery_notes'])assert.match(js,new RegExp(name));
 assert.match(js,/portal_update_preferences/);
 assert.match(sql,/security definer/i);
 assert.match(sql,/grant execute on function public\.portal_update_preferences/);
});

test('portal supports customer defaults and manual NL EN DE switching',()=>{
 const html=read('portal.html'),i18n=read('assets/customer-portal-i18n-v1.js'),commercial=read('assets/commercial.js'),sql=read('supabase/migrations/20261011194000_portal_language_and_request_types.sql');
 for(const code of ['nl','en','de'])assert.match(html,new RegExp(`value="${code}"`));
 assert.match(i18n,/ralab:portal-customer/);
 assert.match(i18n,/reverse\[shown\]/);
 assert.match(commercial,/ccPortalLanguage/);
 assert.match(commercial,/syncCustomer/);
 assert.match(sql,/preferred_language in \('nl','en','de'\)/i);
});

test('new product work is explicitly separated into quotation and order requests',()=>{
 const js=read('assets/customer-portal.js'),sql=read('supabase/migrations/20261011194000_portal_language_and_request_types.sql');
 assert.match(js,/renderRequest\('quote'\)/);
 assert.match(js,/renderRequest\('order'\)/);
 assert.match(js,/p_request_type:requestType/);
 assert.match(sql,/request_type in \('quote','order'\)/i);
 assert.match(sql,/revoke all on function public\.portal_request_new_product[\s\S]*from public,anon/i);
});

test('logo blends into its surface while retaining readable contrast',()=>{
 const css=read('assets/logo-brand-v1.css');
 assert.match(css,/contrast\(2\)/);
 assert.match(css,/mix-blend-mode:multiply/);
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
 const css=read('assets/customer-portal.css'),html=read('portal.html'),logo=read('assets/logo-brand-v1.css');
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(css,/--ink:#292c31/);
 assert.doesNotMatch(css,/images\.unsplash\.com|--green:/);
 assert.match(html,/Natural stone\./);
 assert.match(html,/logo-brand-v1\.css/);
 assert.match(logo,/grayscale\(1\) invert\(1\)/);
 assert.match(logo,/#portalLoginLogo\{width:min\(340px/);
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
 assert.match(html,/user-access-1/);
 assert.match(admin,/Controlelijst/);
 assert.match(admin,/Klopt · volgende klant/);
 assert.match(admin,/data-portal-save-product/);
 assert.match(admin,/Ontkoppelen/);
 assert.match(admin,/Nog niet gekoppelde producten/);
 assert.match(admin,/replace\(','\s*,\s*'\.'\)/);
});

test('portal administrators can block, reactivate and remove customer access',()=>{
 const admin=read('assets/customer-portal-admin-v1.js'),edge=read('supabase/functions/portal-admin/index.ts');
 assert.match(admin,/data-portal-user-action/);
 assert.match(admin,/Tijdelijk blokkeren/);
 assert.match(admin,/Weer activeren/);
 assert.match(admin,/order- en aanvraaghistorie blijft bewaard/);
 assert.match(edge,/\["block", "activate", "remove"\]/);
 assert.match(edge,/ban_duration: active \? "none" : "876000h"/);
 assert.match(edge,/from\("portal_customer_users"\)\.delete\(\)/);
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

test('all edited customer products can be saved in one action',()=>{
 const admin=read('assets/customer-portal-admin-v1.js');
 assert.match(admin,/function saveAllProducts/);
 assert.match(admin,/productUpdateFromRow/);
 assert.match(admin,/data-portal-save-all/);
 assert.match(admin,/Alles opslaan · volgende klant/);
 assert.match(admin,/Promise\.all\(records\.map/);
});
