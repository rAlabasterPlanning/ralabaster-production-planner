const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../assets/erp.js'),'utf8');
const helpers=source.slice(source.indexOf('function orderDeadlineValue'),source.indexOf('function setOverviewOrderNo'));
function api(){const c=vm.createContext({esc:x=>String(x??'')});vm.runInContext(helpers,c);return c}
test('deadline groups use ISO weeks and keep year boundaries correct',()=>{
 const c=api();for(const [date,key] of [['2026-10-20','2026-W43'],['2026-10-25','2026-W43'],['2026-10-26','2026-W44'],['2027-01-01','2026-W53'],['2027-01-04','2027-W01']])assert.equal(c.deadlineWeek({deadline:date}).key,key);
 assert.match(c.deadlineWeek({deadline:'2026-10-20'}).range,/19 okt.*25 okt/);
 for(const deadline of ['',undefined,'2026-02-30','bad'])assert.equal(c.deadlineWeek({deadline}).label,'Zonder deadline');
 assert.equal(c.deadlineWeek({communicatedDeadline:'2026-10-26',deadline:'2026-10-20'}).key,'2026-W44');
});
test('weeks sort chronologically regardless of production priority with undated orders last',()=>{
 const c=api(),orders=[{id:'none',needsCalculation:true},{id:'44',deadline:'2026-10-26',productionSequence:1},{id:'43b',deadline:'2026-10-24'},{id:'43a',deadline:'2026-10-20'}];orders.sort(c.deadlineWeekSort);assert.deepEqual(orders.map(x=>x.id),['43a','43b','44','none']);
 const header=c.weekHeaders(orders,true);assert.match(header(orders[0]),/Week 43.*2 orders/);assert.equal(header(orders[1]),'');assert.match(header(orders[2]),/Week 44.*1 order/);assert.match(header(orders[3]),/Zonder deadline/);
});
test('both order views render week headings, exclude completed orders and support other sort modes',()=>{
 const roots=Object.fromEntries(['view-orders','view-orderoverview'].map(id=>[id,{dataset:{},innerHTML:'',querySelector:()=>null}]));
 const orders=[{id:'44',orderNo:'C',product:'C',deadline:'2026-10-26',active:true},{id:'43b',orderNo:'B',product:'B',deadline:'2026-10-25',active:true},{id:'43a',orderNo:'A',product:'A',deadline:'2026-10-20',active:true},{id:'none',orderNo:'D',product:'D',active:true},{id:'done',active:false,status:'completed'}];
 const c=vm.createContext({window:{},state:{orders,tasks:[]},document:{getElementById:id=>roots[id],addEventListener:()=>{},createElement:()=>({}),head:{appendChild:()=>{}}},setTimeout:()=>1,requestAnimationFrame:()=>{},console});vm.runInContext(source,c);
 c.window.RALAB_ERP.renderOrderOverview();let html=roots['view-orderoverview'].innerHTML;
 assert.match(html,/Week 43.*2 orders/s);assert.match(html,/Week 44/);assert.match(html,/Zonder deadline/);assert.ok(html.indexOf('data-overview-order="43a"')<html.indexOf('data-overview-order="44"'));assert.doesNotMatch(html,/data-overview-order="done"/);
 roots['view-orderoverview'].dataset.overviewSort='production';c.window.RALAB_ERP.renderOrderOverview();assert.doesNotMatch(roots['view-orderoverview'].innerHTML,/data-deadline-week=/);
 c.window.RALAB_ERP.renderOrders();html=roots['view-orders'].innerHTML;assert.match(html,/Week 43/);assert.match(html,/Week 44/);assert.doesNotMatch(html,/data-order-card="done"/);
 roots['view-orders'].dataset.orderSort='deadline-desc';c.window.RALAB_ERP.renderOrders();assert.doesNotMatch(roots['view-orders'].innerHTML,/data-deadline-week=/);
 roots['view-orders'].dataset.orderSort='week';roots['view-orders'].dataset.q='B';c.window.RALAB_ERP.renderOrders();html=roots['view-orders'].innerHTML;assert.match(html,/Week 43/);assert.doesNotMatch(html,/Week 44/);
});
