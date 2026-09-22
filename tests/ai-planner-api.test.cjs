const {test}=require('node:test'),assert=require('node:assert/strict');

function response(){return{code:0,body:null,status(n){this.code=n;return this},json(x){this.body=x;return this}}}

test('AI planner endpoint rejects unsupported methods and anonymous use',async()=>{
 const {default:handler}=await import('../api/ai-planner.mjs');
 let res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.code,405);
 res=response();await handler({method:'POST',headers:{},body:{message:'Plan dit'}},res);assert.equal(res.code,401);assert.match(res.body.error,/Supabase/);
});
