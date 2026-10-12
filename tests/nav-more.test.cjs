const {test}=require('node:test'),assert=require('node:assert/strict');
const {fullApp}=require('./full-app-fixture.cjs');
const tap=(w,el)=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:100,clientY:100}));

test('More opens outside the scrolling nav and every navigation handler closes it',async t=>{
  const f=await fullApp(t),w=f.w,d=w.document;
  const trigger=d.querySelector('.nav-more-trigger'),menu=d.getElementById(trigger.getAttribute('aria-controls'));
  assert.ok(menu.closest('header'));
  assert.equal(menu.closest('nav'),null);
  for(const view of ['products','workplaces','inventory','settings','customers']){
    tap(w,trigger);
    assert.equal(menu.hidden,false);
    assert.equal(trigger.getAttribute('aria-expanded'),'true');
    tap(w,menu.querySelector(`[data-view="${view}"]`));
    await f.wait(100);
    assert.equal(menu.hidden,true,view);
    assert.equal(trigger.getAttribute('aria-expanded'),'false');
    assert.equal(d.getElementById('view-'+view).classList.contains('hidden'),false,view);
  }
  assert.deepEqual(f.errors,[]);
});

test('More toggles once, closes outside and restores keyboard focus on Escape',async t=>{
  const f=await fullApp(t),w=f.w,d=w.document,trigger=d.querySelector('.nav-more-trigger'),menu=d.getElementById('navMoreMenu');
  tap(w,trigger);tap(w,trigger);assert.equal(menu.hidden,true);
  trigger.click();assert.equal(menu.hidden,false);
  menu.querySelector('[data-view="products"]').focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(menu.hidden,true);assert.equal(d.activeElement,trigger);
  tap(w,trigger);tap(w,d.querySelector('main'));assert.equal(menu.hidden,true);
  assert.deepEqual(f.errors,[]);
});
