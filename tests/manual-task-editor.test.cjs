const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function context(){
 const c={console,state:{orders:[{id:'order',communicatedDeadline:'2026-09-17'}],tasks:[]},document:{addEventListener(){}},setTimeout(){},openTask(){},saveTask(){},renderToday(){},renderWeeks(){},isExternalTask:()=>false,isDryTask:()=>false,
 dayStartTime:()=> '08:15',workdayEndMinutes:(d,e)=>new Date(d+'T12:00Z').getUTCDay()>=1&&new Date(d+'T12:00Z').getUTCDay()<=4?990:0,
 employeeCapacity:(d,e)=>new Date(d+'T12:00Z').getUTCDay()>=1&&new Date(d+'T12:00Z').getUTCDay()<=4?450:0,
 planningBreaks:()=>[[600,615],[735,765]]};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'assets/manual-tasks-end-time-v1.js'),'utf8'),c);return c;
}
function task(){return{id:'t',orderId:'order',seq:2,name:'Gildemeister',machine:'Gildemeister',employee:'Kaan',estimate:750,status:'open',lockedPlanning:true,dependsPrev:false,date:'2026-09-16',start:'09:05',planSegments:[{date:'2026-09-16',start:'09:05',employee:'Kaan',minutes:400,elapsedMinutes:445},{date:'2026-09-17',start:'08:15',employee:'Kaan',minutes:350,elapsedMinutes:395}]}}
function rows(){return[{date:'2026-09-16',start:'09:05',endDate:'2026-09-16',end:'16:30',changed:false},{date:'2026-09-17',start:'08:15',endDate:'2026-09-17',end:'14:50',changed:false}]}
function run(t,r,opts={},others=[]){const c=context();c.state.tasks=[t,...others];const before=JSON.stringify(c.state);const result=c.RALAB_MANUAL_TASKS.buildManualPlan(t,r,{employee:'Kaan',estimate:t.estimate,...opts},c.state.tasks);assert.equal(JSON.stringify(c.state),before,'preview must not mutate any live task or order');return JSON.parse(JSON.stringify(result))}
const total=blocks=>blocks.reduce((n,g)=>n+g.minutes,0);
test('unchanged pause-aware rows have exactly 750 working minutes',()=>{const p=run(task(),rows());assert.equal(total(p.blocks),750);assert.equal(p.blocks[0].elapsedMinutes,445)});
test('multiple manual day changes and overtime are accepted',()=>{const r=rows();r[0].end='18:00';r[1].end='19:00';r.forEach(x=>x.changed=true);const p=run(task(),r);assert.equal(p.estimate,1090);assert.equal(p.blocks[0].elapsedMinutes,535);assert.ok(p.warnings.some(x=>x.includes('werktijd')))});
test('shorter first day retains total and fills the next full day across breaks',()=>{const r=rows();r[0].end='14:00';r[0].changed=true;const p=run(task(),r,{keepTotal:true});assert.equal(p.estimate,750);assert.equal(total(p.blocks.filter(g=>g.date==='2026-09-16')),250);assert.equal(total(p.blocks.filter(g=>g.date==='2026-09-17')),450);assert.equal(total(p.blocks.filter(g=>g.date==='2026-09-21')),50)});
test('longer first day pulls minutes from later days',()=>{const r=rows();r[0].end='18:00';r[0].changed=true;const p=run(task(),r,{keepTotal:true});assert.equal(p.estimate,750);assert.equal(total(p.blocks.filter(g=>g.date==='2026-09-16')),490);assert.equal(total(p.blocks.filter(g=>g.date==='2026-09-17')),260)});
test('explicit overlaps with other employees on the same machine only warn',()=>{const other={...task(),id:'other',employee:'Lance',planSegments:[{date:'2026-09-16',start:'09:00',minutes:450,elapsedMinutes:495,employee:'Lance'}]};const p=run(task(),rows(),{},[other]);assert.ok(p.warnings.some(x=>x.includes('Overlap')));assert.equal(p.blocks[0].start,'09:05')});
test('weekend and overnight times remain exact',()=>{const p=run(task(),[{date:'2026-09-19',start:'22:00',endDate:'2026-09-20',end:'02:00'}]);assert.equal(total(p.blocks),240);assert.equal(p.blocks.length,2);assert.equal(p.blocks[1].start,'00:00');assert.ok(p.warnings.length)});
test('remainder preserves other reserved work',()=>{const other={...task(),id:'other',planSegments:[{date:'2026-09-17',start:'08:15',employee:'Kaan',minutes:450,elapsedMinutes:495}]};const r=rows();r[0].end='14:00';r[0].changed=true;const p=run(task(),r,{keepTotal:true},[other]);assert.equal(total(p.blocks.filter(g=>g.date==='2026-09-17')),0);assert.equal(p.estimate,750)});
test('dependency and deadline conflicts can be overridden',()=>{const t={...task(),dependsPrev:true},prev={...task(),id:'prev',name:'Boren',seq:1};const p=run(t,[{date:'2026-09-16',start:'08:00',endDate:'2026-09-18',end:'18:00'}],{},[prev]);assert.ok(p.warnings.some(x=>x.includes('Vorige stap')));assert.ok(p.warnings.some(x=>x.includes('klantdeadline')))});
test('invalid end before start is rejected without mutation',()=>{assert.throws(()=>run(task(),[{date:'2026-09-16',start:'14:00',endDate:'2026-09-16',end:'12:00'}]),/eindmoment/)});
test('working during breaks is an explicit supported option',()=>{const p=run(task(),[{date:'2026-09-16',start:'10:00',endDate:'2026-09-16',end:'10:15'}],{ignoreBreaks:true});assert.equal(p.estimate,15)});
