const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('group summary counts outstanding quantities after partial deliveries and clamps overdelivery',()=>{
 const root={dataset:{},innerHTML:'',querySelector:()=>null};
 const orders=[{qty:19,deliveredQty:5},{qty:100},{qty:28}].map((o,i)=>({...o,id:String(i),orderNo:String(i),customerName:'Kreon',product:'Long cylinder',active:true}));
 const c=vm.createContext({window:{RALAB_ALABASTER_WAIT:{displayName:x=>x,options:()=>[]}},state:{orders,tasks:[]},document:{getElementById:()=>root,addEventListener(){},createElement:()=>({}),head:{appendChild(){}}},setTimeout:()=>1,requestAnimationFrame(){},console});
 vm.runInContext(fs.readFileSync(require.resolve('../assets/erp.js'),'utf8'),c);
 c.window.RALAB_ERP.renderOrderOverview();assert.match(root.innerHTML,/3 open order\(s\) · 142 st\./);
 orders[0].deliveredQty=24;c.window.RALAB_ERP.renderOrderOverview();assert.match(root.innerHTML,/3 open order\(s\) · 128 st\./);
 orders[0].deliveredQty=0;c.window.RALAB_ERP.renderOrderOverview();assert.match(root.innerHTML,/3 open order\(s\) · 147 st\./);
});
