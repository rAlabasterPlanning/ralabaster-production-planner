const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/portal-packing-pdf.js'),'utf8'),context);
test('packing slip paginates long orders and retains the final product and quantity',()=>{
 const pdf=context.window.RALAB_PACKING_PDF({order_no:'TEST',portal_order_lines:Array.from({length:100},(_,i)=>({line_no:i,description:`Product ${i} `+'omschrijving '.repeat(20),quantity:i+1,unit:'stuks'}))},{company_name:'Café (Test)'},'12 oktober 2026');
 assert(Number(pdf.match(/\/Count (\d+)/)[1])>1);assert.match(pdf,/Product 99/);assert.match(pdf,/100 stuks/);assert.match(pdf,/Cafe \\\(Test\\\)/);
 const offset=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(offset,offset+4),'xref');
 const entries=[...pdf.matchAll(/(\d{10}) 00000 n /g)];entries.forEach((x,i)=>assert(pdf.slice(Number(x[1])).startsWith(`${i+1} 0 obj`)));
});
test('packing slip wraps one very long product across pages without losing the end',()=>{
 const pdf=context.window.RALAB_PACKING_PDF({order_no:'ONE',portal_order_lines:[{description:'omschrijving '.repeat(1000)+'LAST-PRODUCT-TEXT',quantity:2,unit:'stuks'}]},{company_name:'Test'},'');
 assert(Number(pdf.match(/\/Count (\d+)/)[1])>1);assert(pdf.includes('LAST-PRODUCT-TEXT'));assert(pdf.includes('2 stuks'));
});
