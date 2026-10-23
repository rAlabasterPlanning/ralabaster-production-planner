const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {fullApp}=require('./full-app-fixture.cjs');
test('accepted PO and distinct delivery dates appear on PDFs, print documents and production sheet',async t=>{
 const f=await fullApp(t),w=f.w;const source={id:'po-source',quoteNo:'PO-QUOTE',name:'Sample',qty:2,saleUnit:100,total:200,customerReference:'ORIGINAL',customerReadyDate:'2026-11-01',created:'2026-10-23',validUntil:'2026-11-23',customerSnapshot:{company:'Demo'}};
 const order={id:'po-order',orderNo:'PO-ORDER',sourceQuoteNo:'PO-QUOTE',sourceQuoteLineId:'po-source',product:'Sample',qty:2,saleUnit:100,totalSale:200,customerReference:'PO-CUSTOMER-123',requestedDeliveryDate:'2026-12-01',customerReadyDate:'2026-12-01',communicatedDeadline:'2026-12-15',deadline:'2026-12-15',customerSnapshot:{company:'Demo'}};
 vm.runInContext(`state.quotes=${JSON.stringify([source])};state.orders=${JSON.stringify([order])}`,f.ctx);const before=JSON.stringify(f.state().quotes);
 for(const [kind,id] of [['quote','PO-QUOTE'],['order','po-order']]){const doc=await w.RALAB_DOCUMENT_OUTLOOK.create(kind,id),pdf=Buffer.from(doc.bytes).toString('latin1');assert.match(pdf,/PO-CUSTOMER-123/);assert.match(pdf,/01\/12\/2026/);assert.match(pdf,/15\/12\/2026/);if(process.env.ORDER_DETAILS_PDF&&kind==='order')fs.writeFileSync(process.env.ORDER_DETAILS_PDF,Buffer.from(doc.bytes))}
 let html='';w.open=()=>({document:{write:s=>html=s,close(){}}});
 for(const [method,id] of [['printQuotation','PO-QUOTE'],['printOrderConfirmation','po-order'],['printPackingList','po-order']]){await w.RALAB_DOCUMENTS_V4[method](id);assert.match(html,/PO-CUSTOMER-123/);assert.match(html,/01[\/-]12[\/-]2026/);assert.match(html,/15[\/-]12[\/-]2026/)}
 w.RALAB_DOCS.printOrderConfirmation('po-order');assert.match(html,/PO-CUSTOMER-123/);assert.match(html,/Requested delivery/);assert.match(html,/Confirmed delivery/);
 const model=w.RALAB_ORDER_PRINT.model(order,[]),production=w.RALAB_ORDER_PRINT.html([model]);assert.match(production,/PO-CUSTOMER-123/);assert.match(production,/2026-12-01/);assert.match(production,/2026-12-15/);assert.equal(JSON.stringify(f.state().quotes),before);const longPo='PO-'+ '1234567890'.repeat(19)+'-END';vm.runInContext('state.orders[0].customerReference='+JSON.stringify(longPo),f.ctx);const longDoc=await w.RALAB_DOCUMENT_OUTLOOK.create('order','po-order'),longPdf=Buffer.from(longDoc.bytes).toString('latin1');assert.match(longPdf,/END/);assert.match(longPdf,/15\/12\/2026/);if(process.env.ORDER_DETAILS_PDF)fs.writeFileSync(process.env.ORDER_DETAILS_PDF.replace('.pdf','-long.pdf'),Buffer.from(longDoc.bytes));assert.deepEqual(f.errors,[]);
});


