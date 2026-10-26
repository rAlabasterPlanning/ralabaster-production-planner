const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
test('order modal buttons receive real mouse and touch clicks',async t=>{
 const root=path.resolve(__dirname,'..');
 const seed=fs.readFileSync(path.join(root,'tests/editor-fixture.js'),'utf8').split('let state=')[0];
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[^>]*src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<script src="assets\/(config|admin-auth)\.js[^>]*><\/script>/g,'');
 html=html.replace(/<script src="assets\/app-loader\.js[^>]*><\/script>/,`<script>(()=>{${seed};localStorage.setItem('ralabaster_planner_v1',JSON.stringify({...initial,version:11}));})();</script><script src="/base.js"></script>`);
 const base=Array.from({length:7},(_,i)=>fs.readFileSync(path.join(root,'assets/app.part0'+(i+1)+'.txt'),'utf8')).join('');
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://test').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}if(pathname==='/base.js'){res.setHeader('Content-Type','text/javascript');return res.end(base)}const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'text/javascript');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true});t.after(()=>browser.close());
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:820,height:1180}:{width:1280,height:900},hasTouch:touch,isMobile:touch});t.after(()=>context.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(1600);
  assert.deepEqual(errors,[]);await page.evaluate(()=>RALAB_ERP.openOrder('o1'));const button=page.locator('[data-order-task-toggle="test-task"]');
  const before=await button.innerText();if(touch)await button.tap();else await button.click();await page.waitForTimeout(100);assert.notEqual(await page.locator('[data-order-task-toggle="test-task"]').innerText(),before);
  const close=page.locator('[data-order-save-close="o1"]');if(touch)await close.tap();else await close.click();await page.waitForTimeout(100);assert.equal(await page.locator('#modalRoot').innerText(),'');assert.deepEqual(errors,[]);
 }
});
