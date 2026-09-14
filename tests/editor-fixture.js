// Synthetic data only. This page never loads config.js or connects to Supabase.
const EMPLOYEES=['Ralph','Peter','Kaan','Lance','Shaffi'];
const CFG={schedule:{breaks:[{start:'10:00',end:'10:15'},{start:'12:15',end:'12:45'}]}};
const NORMAL_DAY_MIN=495,FRIDAY_RALPH_MIN=405,SATURDAY_OT_MIN=240;
const isoDate=d=>d.toISOString().slice(0,10),parseDate=d=>new Date(d+'T12:00:00Z');
const timeToMin=x=>{const [h,m]=x.split(':').map(Number);return h*60+m};
const dayStartTime=()=> '08:15';
const workdayEndMinutes=(d,e)=>{const n=parseDate(d).getDay();return n>=1&&n<=4?990:n===5&&e==='Ralph'?900:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isExternalTask=t=>t.type==='external',isDryTask=t=>t.type==='wait';
const statusLabel=t=>t.status||'open';
const order=id=>state.orders.find(o=>o.id===id);
const prevTask=t=>state.tasks.find(x=>x.orderId===t.orderId&&x.seq===t.seq-1);
const isBlocked=t=>!!t.dependsPrev&&prevTask(t)?.status!=='done';
const originalTask={id:'test-task',orderId:'o1',seq:2,name:'Gildemeister',machine:'Gildemeister',employee:'Kaan',estimate:750,status:'open',lockedPlanning:true,date:'2026-09-16',start:'09:05',actual:0,doneQty:0,note:'',dependsPrev:false,planSegments:[{date:'2026-09-16',employee:'Kaan',start:'09:05',minutes:400,elapsedMinutes:445},{date:'2026-09-17',employee:'Kaan',start:'08:15',minutes:350,elapsedMinutes:395}]};
const busyTask={...originalTask,id:'busy',orderId:'o2',seq:1,name:'Ander project',employee:'Lance',planSegments:[{date:'2026-09-16',employee:'Lance',start:'16:30',minutes:90,elapsedMinutes:90}]};
const initial={orders:Array.from({length:75},(_,i)=>({id:'o'+(i+1),orderNo:'TARGET-'+String(i+1).padStart(3,'0'),customerName:i===74?'TigerMoth':'Klant '+i,product:i===74?'Alabaster Pendant':'Lamp '+i,project:'Project '+i,qty:50,active:true,communicatedDeadline:'2026-09-'+(i%2?'18':'17')})),tasks:[originalTask,busyTask],history:[]};
let state=JSON.parse(localStorage.getItem('manual-editor-test-state')||JSON.stringify(initial));
function save(){localStorage.setItem('manual-editor-test-state',JSON.stringify(state))}
function showModal(html){document.getElementById('modalRoot').innerHTML='<div class="modalback"><div class="modal">'+html+'</div></div>'}
function closeModal(){document.getElementById('modalRoot').innerHTML=''}
function renderToday(){}function renderWeeks(){}
function render(){RALAB_ERP.renderOrders();document.getElementById('saved').textContent=JSON.stringify(state.tasks,null,2);document.getElementById('unchanged').textContent=JSON.stringify(state.tasks.find(t=>t.id==='busy'))===JSON.stringify(busyTask)?'Andere taak ongewijzigd':'FOUT: andere taak gewijzigd'}
function scheduleTaskAcrossCapacity(){throw Error('Legacy scheduler must not run after manual save')}
