const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {fullApp}=require('./full-app-fixture.cjs');
test('order confirmation PDFs and attached Outlook draft include verified payment details on every page',async t=>{
 const f=await fullApp(t),w=f.w;
 vm.runInContext(`state.orders=[{id:'bank-test',orderNo:'BANK-TEST',product:'Alabaster sample',qty:1,saleUnit:100,totalSale:100,created:'2026-10-20',customerSnapshot:{company:'Demo customer',country:'United Kingdom'}}]`,f.ctx);
 const before=JSON.stringify(f.state());const doc=await w.RALAB_DOCUMENT_OUTLOOK.create('order','bank-test'),pdf=Buffer.from(doc.bytes).toString('latin1');
 assert.match(pdf,/Account holder: rAlabaster - Linck BV/);assert.match(pdf,/IBAN: NL05 INGB 0008 3606 51/);assert.match(pdf,/BIC\/SWIFT: INGBNL2A/);assert.match(pdf,/ING Bank N.V./);
 const eml=w.RALAB_DOCUMENT_OUTLOOK.emlBytes(doc,'demo@example.test');const attachment=eml.split('Content-Disposition: attachment;')[1].split('\r\n\r\n')[1].split('\r\n--')[0];assert.equal(Buffer.from(attachment.replace(/\s/g,''),'base64').includes(Buffer.from('NL05 INGB 0008 3606 51')),true);
 assert.equal(JSON.stringify(f.state()),before);
 if(process.env.BANK_PDF_PREVIEW)fs.writeFileSync(process.env.BANK_PDF_PREVIEW,Buffer.from(doc.bytes));
 vm.runInContext(`state.orders=Array.from({length:40},(_,i)=>({id:'line-'+i,orderNo:'MULTI-'+i,orderGroupId:'bank-group',product:'Product '+i,qty:1,saleUnit:100,customerSnapshot:{company:'Demo customer',country:'United Kingdom'}}))`,f.ctx);
 const multipage=Buffer.from(await w.RALAB_DOCUMENT_OUTLOOK.orderPdfBytes('line-0')).toString('latin1'),pages=(multipage.match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>1);assert.equal((multipage.match(/IBAN: NL05 INGB 0008 3606 51/g)||[]).length,pages);
 assert.deepEqual(f.errors,[]);
});
test('print confirmation includes bank details while packing list omits payment information',async t=>{
 const f=await fullApp(t),w=f.w;vm.runInContext(`state.orders=[{id:'print-bank',orderNo:'PRINT-1',product:'Sample',qty:1,saleUnit:100,customerSnapshot:{company:'Demo',country:'United Kingdom'}}]`,f.ctx);let html='';w.open=()=>({document:{write:s=>html=s,close:()=>{}}});
 await w.RALAB_DOCUMENTS_V4.printOrderConfirmation('print-bank');assert.match(html,/NL05 INGB 0008 3606 51/);assert.match(html,/INGBNL2A/);assert.match(html,/rAlabaster - Linck BV/);
 await w.RALAB_DOCUMENTS_V4.printPackingList('print-bank');assert.doesNotMatch(html,/NL05 INGB|INGBNL2A/);
 w.RALAB_DOCS.printOrderConfirmation('print-bank');assert.match(html,/NL05 INGB 0008 3606 51/);assert.match(html,/INGBNL2A/);
});
test('configured IBAN passes its country format and modulo-97 check',()=>{
 const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(require.resolve('../assets/company-details.js'),'utf8'),c);const iban=c.window.RALAB_COMPANY.iban.replace(/\s/g,'');assert.match(iban,/^NL\d{2}INGB\d{10}$/);let n=0;for(const digit of (iban.slice(4)+iban.slice(0,4)).replace(/[A-Z]/g,l=>String(l.charCodeAt(0)-55)))n=(n*10+Number(digit))%97;assert.equal(n,1);assert.equal(c.window.RALAB_COMPANY.bic,'INGBNL2A');
});
