const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('quotation document uses a complete decodable embedded logo',()=>{
 const root=path.resolve(__dirname,'..');
 const source=fs.readFileSync(path.join(root,'assets/document-layout-v4.js'),'utf8');
 const base64=fs.readFileSync(path.join(root,'assets/ralabaster-logo.b64.txt'),'utf8').replace(/\s+/g,'');
 assert.match(source,/ralabaster-logo\.b64\.txt/);
 assert.match(source,/data:image\/jpeg;base64/);
 assert.equal(base64.length%4,0);
 assert.match(Buffer.from(base64,'base64').subarray(0,3).toString('hex'),/^ffd8ff$/);
});
