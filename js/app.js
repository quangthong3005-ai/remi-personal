
(function(){
'use strict';
const {parseQty,stepQty,scaleQty,canStep}=window.RemiQty;

/* ---------- helpers ---------- */
const WD=['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
const WDS=['CN','T2','T3','T4','T5','T6','T7'];
const pad=n=>String(n).padStart(2,'0');
const dKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const toLocal=d=>dKey(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
const hm=d=>pad(d.getHours())+':'+pad(d.getMinutes());
const uid=()=>Math.random().toString(36).slice(2,9);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const fmtNum=n=>Number(n).toLocaleString('vi-VN');
const leadText=m=>(m>=60&&m%60===0)?(m/60)+' tiếng':m+' phút';
const REPEAT={none:'',daily:'Hằng ngày',weekly:'Hằng tuần'};

function dayLabel(d){
  const t=new Date(), k=dKey(d);
  if(k===dKey(t)) return 'Hôm nay';
  const n=new Date(t); n.setDate(n.getDate()+1);
  if(k===dKey(n)) return 'Ngày mai';
  return WDS[d.getDay()]+', '+d.getDate()+'/'+(d.getMonth()+1);
}

const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
const state={
  tasks:store.get('remi.tasks',[]),
  habits:store.get('remi.habits',[]),
  fired:store.get('remi.fired',{}),
  profile:store.get('remi.profile',null),
  sleep:store.get('remi.sleep',null),
  greeted:store.get('remi.greeted',''),
  pantry:store.get('remi.pantry',{}),
  dishes:store.get('remi.dishes',{}),
  dayNotes:store.get('remi.daynotes',{}),
  kitchen:window.RemiKitchen.normalizeKitchen(store.get('remi.kitchen',null))   // nhóm B: thực đơn tuần, tủ đồ, món của tôi
};
if(!Array.isArray(state.tasks)) state.tasks=[];
if(!Array.isArray(state.habits)) state.habits=[];
if(!state.pantry||typeof state.pantry!=='object'||Array.isArray(state.pantry))state.pantry={};
if(!state.dishes||typeof state.dishes!=='object'||Array.isArray(state.dishes))state.dishes={};
if(!state.dayNotes||typeof state.dayNotes!=='object'||Array.isArray(state.dayNotes))state.dayNotes={};
state.badges=window.RemiStats.normBadges(store.get('remi.badges',null));
function sleepDayKey(){return dKey(new Date(Date.now()-4*3600000))}
if(!state.sleep||typeof state.sleep!=='object'){const hr0=new Date().getHours();state.sleep={day:sleepDayKey(),awake:hr0>=6&&hr0<23,wakeAt:null}}
state.habits.forEach(h=>{
  if(!h.log)h.log={};
  if(h.unit!==undefined||h.goal!==undefined){
    const st=h.step||1;
    Object.keys(h.log).forEach(k=>{h.log[k]=Math.round((h.log[k]||0)/st)});
    delete h.unit;delete h.goal;delete h.step;
  }
  if(!Array.isArray(h.days)||!h.days.length)h.days=[0,1,2,3,4,5,6];
  if(!Array.isArray(h.times)||!h.times.length)h.times=['07:00'];
});
if(!state.fired||typeof state.fired!=='object') state.fired={};
state.meta=store.get('remi.meta',null);
if(!state.meta||typeof state.meta!=='object')state.meta={};
['dnU','dishU','mealU','deleted'].forEach(k=>{if(!state.meta[k]||typeof state.meta[k]!=='object')state.meta[k]={}});
state.meta.profileU=state.meta.profileU||0;state.meta.sleepU=state.meta.sleepU||0;
function persist(){
  store.set('remi.tasks',state.tasks);store.set('remi.habits',state.habits);store.set('remi.fired',state.fired);store.set('remi.profile',state.profile);
  store.set('remi.sleep',state.sleep);store.set('remi.greeted',state.greeted);store.set('remi.pantry',state.pantry);store.set('remi.dishes',state.dishes);
  store.set('remi.daynotes',state.dayNotes);store.set('remi.badges',state.badges);store.set('remi.kitchen',state.kitchen);store.set('remi.meta',state.meta);
}
function save(){
  checkBadges();
  const keys=Object.keys(state.fired);
  if(keys.length>400){keys.slice(0,keys.length-300).forEach(k=>delete state.fired[k])}
  Sync.stamp();
  persist();
  Sync.afterSave();
}
let tab='today';
/* Nhóm B: tab Bếp (thực đơn tuần, tủ đồ, món của tôi). Giao diện nằm ở kitchen-ui.js, logic ở kitchen.js. */
const KUI=window.RemiKitchenUI({
  state:state,store:store,esc:esc,uid:uid,
  save:()=>save(),render:()=>render(),closeSheet:()=>closeSheet(),
  alertUser:(a,b,c,d)=>alertUser(a,b,c,d),toast:m=>toast(m),pantryAdd:n=>pantryAdd(n),
  whenBlockHtml:(w,l,r,px)=>whenBlockHtml(w,l,r,px),bindWhenBlock:px=>bindWhenBlock(px),toLocal:d=>toLocal(d),
  goTab:t=>{tab=t;render();window.scrollTo({top:0})}
});
const openIds=new Set();

/* ---------- sleep, wake & day window ---------- */
const WAKE_BUF=30;
const toMin=t=>{const a=String(t).split(':');return (+a[0])*60+(+a[1])};
const fromMin=m=>pad(Math.floor(m/60)%24)+':'+pad(m%60);
function profileWake(){return (state.profile&&state.profile.wake)||'06:30'}
function profileBed(){return (state.profile&&state.profile.bed)||'22:30'}
function wakeStart(){return (state.sleep.awake&&state.sleep.wakeAt)?hm(new Date(state.sleep.wakeAt)):profileWake()}
function windowTimes(count,fromM,toM){
  if(count<=1||toM<=fromM)return [fromMin(fromM)];
  const step=(toM-fromM)/(count-1),out=[];
  for(let i=0;i<count;i++){const t=fromMin(Math.min(1435,Math.round((fromM+i*step)/5)*5));if(out.indexOf(t)<0)out.push(t)}
  return out;
}
function calcSpread(sp){
  const ex=/^\d{2}:\d{2}$/;
  if(ex.test(sp.from)&&ex.test(sp.to))return windowTimes(Math.max(1,sp.count),toMin(sp.from),toMin(sp.to));   // "từ 1h-5h chia 4 lần": giờ đầu và giờ cuối đều có nhắc
  const now=new Date(),nowM=now.getHours()*60+now.getMinutes();
  let start;
  if(sp.from==='now')start=nowM;
  else if(sp.from==='wake')start=Math.max(toMin(wakeStart()),nowM);
  else start=toMin(sp.from);
  const end=Math.min(1435,sp.to==='bed'?toMin(profileBed()):toMin(sp.to));
  if(end<=start+20)return [fromMin(Math.min(1435,start+5))];
  const n=Math.max(1,sp.count),step=(end-start)/n;
  const out=[];
  for(let i=0;i<n;i++){const m=Math.round((start+(i+0.5)*step)/5)*5;const t=fromMin(Math.min(1435,m));if(out.indexOf(t)<0)out.push(t)}
  return out;
}
function hTimes(h){return (h.spread&&h.plan&&h.plan.day===sleepDayKey())?h.plan.times:h.times}
function habitActive(h,d){return h.once?h.date===dKey(d):h.days.indexOf(d.getDay())>=0}
function wakePlan(){
  const now=new Date();
  const c=state.tasks.filter(t=>!t.done&&t.when).map(t=>({t:t,d:new Date(t.when)}))
    .filter(x=>x.d>now&&x.d-now<24*3600000&&x.d.getHours()<12).sort((a,b)=>a.d-b.d)[0];
  if(!c)return null;
  const call=new Date(c.d.getTime()-WAKE_BUF*60000);
  return {task:c.t,title:c.t.title,due:c.d,call:call,callStr:hm(call),timeStr:hm(c.d)};
}
function setAwake(v){
  const now=new Date();
  state.sleep.day=sleepDayKey();
  if(v){
    if(state.sleep.awake&&state.sleep.wakeAt)return;
    state.sleep.awake=true;state.sleep.wakeAt=toLocal(now);
    state.habits.forEach(h=>{if(h.spread)h.plan=null});
    save();tick();render();
    const n=state.tasks.filter(t=>!t.done&&t.when&&dKey(new Date(t.when))===dKey(now)&&new Date(t.when)>now).length;
    const hasSpread=state.habits.some(h=>h.spread&&habitActive(h,now));
    if(state.greeted!==sleepDayKey()){
      state.greeted=sleepDayKey();save();
      alertUser('☀️',greetWord()+', '+(nm()||'bạn'),(n?'Hôm nay còn '+n+' việc. ':'')+(hasSpread?'Giờ uống nước đã chia lại từ '+hm(now)+'.':'Chúc bạn một ngày nhiều năng lượng.'));
    }
  }else{
    state.sleep.awake=false;state.sleep.wakeAt=null;
    save();render();
    const wp=wakePlan();
    alertUser('😴','Ngủ ngon, '+(nm()||'bạn'),wp?'Mai gọi dậy lúc '+wp.callStr+' vì '+wp.timeStr+' có '+wp.title.charAt(0).toLowerCase()+wp.title.slice(1)+'.':'Không có việc buổi sáng, bạn ngủ thoải mái nhé.');
  }
}
const lc=x=>x.charAt(0).toLowerCase()+x.slice(1);
function greetWord(){const hr=new Date().getHours();return hr<11?'Chào buổi sáng':hr<14?'Chào buổi trưa':hr<18?'Chào buổi chiều':'Chào buổi tối'}
function nearBed(){const d=new Date(),m=d.getHours()*60+d.getMinutes();return m>=toMin(profileBed())-60||m<240}
function renderSleep(){
  const aw=state.sleep.awake,tr=$('#sl-track');
  tr.classList.toggle('on',aw);
  tr.setAttribute('aria-checked',String(aw));
  $('#sl-thumb').textContent=aw?'☀️':'😴';
  const wp=wakePlan();
  const plan=wp?((dKey(wp.due)===dKey(new Date())?'Sáng nay':'Sáng mai')+' gọi dậy lúc '+wp.callStr+' vì '+wp.timeStr+' có '+lc(wp.title)+'.'):'';
  if(aw){$('#sl-t').textContent='Sắp đến giờ ngủ';$('#sl-s').textContent=(plan?plan+' ':'')+'Trượt sang trái khi đi ngủ.'}
  else{$('#sl-t').textContent='Đang ngủ';$('#sl-s').textContent=plan?plan.replace('Sáng nay','Sẽ').replace('Sáng mai','Sẽ'):'Trượt sang phải khi bạn thức dậy.'}
}
function tickClock(){
  const d=new Date(),c=document.getElementById('clock');
  if(c)c.innerHTML=pad(d.getHours())+':'+pad(d.getMinutes())+'<small>:'+pad(d.getSeconds())+'</small>';
  const cn=document.getElementById('cal-now');
  if(cn)cn.textContent='Bây giờ: '+WD[d.getDay()]+', '+d.getDate()+'/'+(d.getMonth()+1)+', '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}
(function(){
  const track=document.getElementById('sl-track'),thumb=document.getElementById('sl-thumb');
  let drag=null;
  const W=()=>track.clientWidth-52;
  track.addEventListener('pointerdown',e=>{drag={x:e.clientX,moved:false,start:state.sleep.awake,pos:state.sleep.awake?W():0};try{track.setPointerCapture(e.pointerId)}catch(err){}track.classList.add('drag')});
  track.addEventListener('pointermove',e=>{
    if(!drag)return;
    const dx=e.clientX-drag.x;if(Math.abs(dx)>4)drag.moved=true;
    drag.pos=Math.max(0,Math.min(W(),(drag.start?W():0)+dx));
    thumb.style.left=(drag.pos+4)+'px';
  });
  const end=cancel=>{
    if(!drag)return;
    const d=drag;drag=null;track.classList.remove('drag');thumb.style.left='';
    if(cancel){renderSleep();return}
    const want=d.moved?(d.pos>W()/2):!d.start;
    if(want!==state.sleep.awake||(want&&!state.sleep.wakeAt))setAwake(want);else renderSleep();
  };
  track.addEventListener('pointerup',()=>end(false));
  track.addEventListener('pointercancel',()=>end(true));
  track.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setAwake(!state.sleep.awake)}});
})();

/* ---------- shopping memory ---------- */
function dishKey(t){const r=String(t).toLowerCase().replace(/^(đi chợ|đi siêu thị|đi mua|mua sắm|mua)\s*/,'').trim();return r||String(t).toLowerCase().trim()}
function findDish(title){
  const k=dishKey(title);if(!k)return null;
  let best=null,bl=0;
  Object.keys(state.dishes).forEach(d=>{if(d.length>=3&&(d===k||k.indexOf(d)>=0||d.indexOf(k)>=0)&&d.length>bl){best=d;bl=d.length}});
  return best?state.dishes[best]:null;
}
/** Món đã nhớ: bản cũ là mảng, bản mới là {s: số người, items: [...]}. */
function dishRecord(v){
  if(!v)return null;
  if(Array.isArray(v))return {s:0,items:v};
  return {s:v.s||0,items:Array.isArray(v.items)?v.items:[]};
}
function saveDish(title,list,servings){
  const items=(list||[]).map(c=>({item:c.item,qty:c.qty||''}));
  if(items.length)state.dishes[dishKey(title)]={s:servings||0,items:items};
}
function pantryAdd(name){const k=String(name).trim().toLowerCase();if(!k)return;const e=state.pantry[k]||{name:String(name).trim(),n:0};e.n++;state.pantry[k]=e}
function addItem(id){
  const inp=document.querySelector('input[data-in="'+id+'"]');if(!inp)return;
  const v=inp.value.trim();if(!v)return;
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  t.checklist=t.checklist||[];
  if(!t.checklist.some(c=>c.item.toLowerCase()===v.toLowerCase()))t.checklist.push({item:v,qty:'',done:false});
  pantryAdd(v);
  saveDish(t.title,t.checklist,t.servings);
  openIds.add(id);save();render();
}

/* ---------- personal voice ---------- */
const TONES={casual:'Thân mật',polite:'Lịch sự',fun:'Vui vẻ'};
function nm(){return (state.profile&&state.profile.name)||''}
function phrase(kind,title,mt,name,tone){
  const n=(name!==undefined?name:nm())||'bạn';
  tone=tone||(state.profile&&state.profile.tone)||'casual';
  const w=title.charAt(0).toLowerCase()+title.slice(1);
  const S={
    casual:{due:[n+' ơi, đến giờ '+w+' rồi nè!',n+' ơi, '+w+' thôi nào!'],lead:[n+' ơi, còn '+mt+' nữa là tới giờ '+w+' đó.'],wake:[n+' ơi, dậy thôi! Còn '+mt+' nữa là tới giờ '+w+' đó.'],wake2:[n+' ơi, '+mt+' nữa là '+w+' rồi, dậy ngay nào!']},
    polite:{due:[n+', đã đến giờ '+w+'.'],lead:[n+', còn '+mt+' nữa đến giờ '+w+'.'],wake:[n+', đã đến giờ thức dậy. Còn '+mt+' nữa đến giờ '+w+'.'],wake2:[n+', chỉ còn '+mt+' nữa đến giờ '+w+'.']},
    fun:{due:['Tới giờ '+w+' rồi '+n+' ơi, xông lên nào! 🚀'],lead:[n+' ơi, '+mt+' nữa thôi! Chuẩn bị '+w+' nào ✨'],wake:['Dậy nào '+n+' ơi! ☀️ Còn '+mt+' nữa là '+w+'.'],wake2:['Báo động! '+mt+' nữa là '+w+' mà '+n+' vẫn đang ngủ 😴']}
  };
  const a=S[tone][kind];return a[Math.floor(Math.random()*a.length)];
}

/* ---------- alerts ---------- */
function alertUser(emoji,title,body,action){
  const box=$('#alerts');
  const el=document.createElement('div');
  el.className='alert';
  el.innerHTML='<div class="em">'+esc(emoji)+'</div><div class="tx"><b>'+esc(title)+'</b><span>'+esc(body)+'</span></div><button class="x" aria-label="Đóng">×</button>';
  if(action){
    const acts=document.createElement('div');acts.className='acts';
    const b=document.createElement('button');b.textContent=action.label;
    b.onclick=()=>{action.fn();el.remove()};
    acts.appendChild(b);el.querySelector('.tx').appendChild(acts);
  }
  el.querySelector('.x').onclick=()=>el.remove();
  box.appendChild(el);
  setTimeout(()=>el.remove(),25000);
  try{if(navigator.vibrate)navigator.vibrate([120,60,120])}catch(e){}
}
function toast(msg){alertUser('✅',msg,'')}

/* ---------- scheduler ---------- */
function advance(t){
  const step=t.repeat==='weekly'?7:1;
  const d=new Date(t.when),now=new Date();
  do{d.setDate(d.getDate()+step)}while(d<=now);
  t.when=toLocal(d);
  (t.checklist||[]).forEach(c=>c.done=false);
}
function tick(){
  const now=new Date();let changed=false;
  const sdk=sleepDayKey();
  if(state.sleep.day!==sdk){
    state.sleep={day:sdk,awake:now.getHours()>=9&&now.getHours()<23,wakeAt:null};
    state.habits.forEach(h=>{h.plan=null});changed=true;
  }
  const nh=state.habits.length;
  state.habits=state.habits.filter(h=>!h.once||h.date>=dKey(now));
  if(state.habits.length!==nh)changed=true;
  state.habits.forEach(h=>{if(h.spread&&(!h.plan||h.plan.day!==sdk)){h.plan={day:sdk,times:calcSpread(h.spread)};changed=true}});
  if(!state.sleep.awake){
    const wp=wakePlan();
    if(wp){
      const k1=wp.task.id+':'+wp.task.when+':wake',k2=wp.task.id+':'+wp.task.when+':wake2';
      if(now>=wp.call&&!state.fired[k1]){
        state.fired[k1]=1;changed=true;
        alertUser('⏰',phrase('wake',wp.title,leadText(Math.max(1,Math.round((wp.due-now)/60000)))),'Lúc '+hm(wp.due)+' bạn có việc.',{label:'Tôi dậy rồi',fn:()=>setAwake(true)});
      }else if(state.fired[k1]&&!state.fired[k2]&&now>=new Date(wp.due.getTime()-10*60000)){
        state.fired[k2]=1;changed=true;
        alertUser('⏰',phrase('wake2',wp.title,'10 phút'),'Bạn vẫn đang ở chế độ ngủ.',{label:'Tôi dậy rồi',fn:()=>setAwake(true)});
      }
    }
  }
  state.tasks.forEach(t=>{
    if(t.done||!t.when)return;
    const due=new Date(t.when);
    const lead=new Date(due.getTime()-(t.leadMin||0)*60000);
    const kl=t.id+':'+t.when+':lead',kd=t.id+':'+t.when+':due';
    if(t.leadMin>0&&now>=lead&&now<due&&!state.fired[kl]){
      state.fired[kl]=1;changed=true;
      const mins=Math.max(1,Math.round((due-now)/60000));
      const n=(t.checklist||[]).length;
      alertUser(t.emoji,phrase('lead',t.title,leadText(mins)),(n?n+' mục cần chuẩn bị, mở thẻ để xem':'Lúc '+hm(due)));
    }
    if(now>=due&&!state.fired[kd]){
      state.fired[kd]=1;changed=true;
      if(now-due<2*3600000) alertUser(t.emoji,phrase('due',t.title),'Lúc '+hm(due),{label:'Đã xong',fn:()=>completeTask(t.id)});
      if(t.repeat!=='none'){advance(t)}
    }
  });
  state.habits.forEach(h=>{
    if(!habitActive(h,now))return;
    const ts=hTimes(h),goal=ts.length,today=Math.min(goal,h.log[dKey(now)]||0);
    if(today>=goal)return;
    ts.forEach(tm=>{
      const [H,M]=tm.split(':').map(Number);
      const at=new Date(now);at.setHours(H,M,0,0);
      const k=h.id+':'+dKey(now)+':'+tm;
      if(now>=at&&now-at<30*60000&&!state.fired[k]){
        state.fired[k]=1;changed=true;
        alertUser(h.emoji,phrase('due',h.title),h.portionMl?'Uống '+h.portionMl+' ml ('+(today*h.portionMl)+'/'+(goal*h.portionMl)+' ml hôm nay)':(goal>1?'Hôm nay '+today+'/'+goal+' lần':'Lúc '+tm),{label:h.portionMl?'Đã uống':'Xong',fn:()=>addHabit(h.id,1)});
      }
    });
  });
  if(changed){save();render()}
}

/* ---------- actions ---------- */
function completeTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  if(t.repeat!=='none'&&t.when){advance(t)}else{t.done=!t.done}
  save();render();
}
function addHabit(id,amt){
  const h=state.habits.find(x=>x.id===id);if(!h)return;
  const k=dKey(new Date());
  h.log[k]=Math.max(0,Math.min(hTimes(h).length,(h.log[k]||0)+amt));
  save();render();
}

/* ---------- AI ---------- */
function defaultWhen(){const d=new Date();d.setHours(d.getHours()+1,0,0,0);return d}
function normalize(r,text){
  r=r||{};
  const intent=(r.intent==='habit'&&r.habit)?'habit':'task';
  const out={
    intent,title:String(r.title||text).slice(0,80),
    emoji:r.emoji||(intent==='habit'?'🎯':'📌'),
    assumption:r.assumption?String(r.assumption).slice(0,60):'',
    summary:r.summary?String(r.summary).slice(0,90):'',
    checklist:Array.isArray(r.checklist)?r.checklist.slice(0,16).map(c=>({item:String((c&&c.item)||c),qty:String((c&&c.qty)||''),done:false})):[],
    tips:Array.isArray(r.tips)?r.tips.slice(0,2).map(t=>String(t).slice(0,70)):[]
  };
  if(intent==='habit'){
    const h=r.habit;
    const rec=!!h.recurring;
    const times=(Array.isArray(h.times)?h.times:[]).filter(x=>/^\d{1,2}:\d{2}$/.test(x)).map(x=>x.padStart(5,'0'));
    const days=(Array.isArray(h.days)?h.days:[]).map(Number).filter(d=>d>=0&&d<=6);
    const fix=x=>/^\d{1,2}:\d{2}$/.test(String(x))?String(x).padStart(5,'0'):String(x);
    let sp=null;
    if(h.spread&&Number(h.spread.count)>0){
      const f=fix(h.spread.from),t=fix(h.spread.to);
      sp={count:Math.min(20,Math.round(Number(h.spread.count))),from:/^(now|wake|\d{2}:\d{2})$/.test(f)?f:(rec?'wake':'now'),to:/^(bed|\d{2}:\d{2})$/.test(t)?t:'bed'};
    }
    let tms=times;
    const sp0=sp?Object.assign({},sp):null;
    if(sp){tms=calcSpread(sp);if(!rec)sp=null}
    let ml=Number(h.ml);
    if(!(ml>=100&&ml<=10000)){
      ml=null;
      const mm=/(\d+(?:[.,]\d+)?)\s*(lít|lit|l|ml)\b/i.exec(String(r.title||text));
      if(mm){const n=parseFloat(mm[1].replace(',','.'));ml=/^ml$/i.test(mm[2])?n:n*1000}
    }
    out.habit={recurring:rec,times:tms.length?tms:['07:00'],days:days.length?Array.from(new Set(days)).sort():[0,1,2,3,4,5,6],spread:sp,waterSpec:sp0,ml:ml?Math.round(ml):null};
  }else{
    let d=r.when?new Date(r.when):null;if(d&&isNaN(d))d=null;
    out.when=toLocal(d||defaultWhen());
    out.leadMin=Math.max(0,Math.min(1440,parseInt(r.leadMinutes,10)||0));
    out.repeat=(r.repeat==='daily'||r.repeat==='weekly')?r.repeat:'none';
    out.shopping=(r.shopping!==undefined&&r.shopping!==null)?!!r.shopping:/chợ|siêu thị|mua sắm|đi mua|nấu/i.test(out.title);
    out.servings=Math.max(1,Math.min(20,parseInt(r.servings,10)||4));
  }
  return out;
}
let busy=false;
async function submit(textArg){
  const text=(typeof textArg==='string'?textArg:$('#ta').value).trim();
  if(!text||busy)return;
  if(/^(hôm nay|tối nay|trưa nay|nay)?\s*(nấu|ăn) gì( hôm nay| tối nay| trưa nay)?\s*\??$/i.test(text)){$('#ta').value='';KUI.openToday();return}   // nhóm B: hỏi nhanh "hôm nay nấu gì"
  busy=true;$('#composer').classList.add('busy');$('#send').disabled=true;
  let parsed=null;
  try{
    const d0=new Date();
    const r=await API.post('/api/ai/parse',{text:text,now:toLocal(d0),weekday:WD[d0.getDay()]});
    parsed=normalize(r.data,text);
  }catch(e){
    if(e.status===401){busy=false;logoutLocal();return}
    alertUser('🤖',e.network?'Cần có mạng để Remi hiểu câu của bạn':'Remi chưa hiểu được lúc này',aiHelp(e));
  }
  busy=false;$('#composer').classList.remove('busy');$('#send').disabled=false;
  if(parsed)openSheet(parsed,'ai');   // lỗi thì giữ nguyên câu đã gõ để thử lại
}
function aiHelp(e){
  if(e.network)return 'Bạn vẫn dùng được các nút Đặt nhắc hẹn, Hẹn lịch và Thêm thói quen.';
  if(e.code==='ai_limit')return e.message;
  if(e.code==='ai_disabled')return 'Máy chủ này chưa bật AI. Nhờ người quản trị điền khóa AI nhé.';
  return 'Thử lại sau ít phút, hoặc dùng các nút tạo nhanh ở trên.';
}

/* ---------- sheet ---------- */
let draft=null;
/* ---------- chọn ngày giờ: nút bấm lớn, ít thao tác ---------- */
function timeWord(t){
  const a=t.split(':').map(Number),H=a[0],M=a[1];
  const pod=H<5?'đêm':H<11?'sáng':H<13?'trưa':H<18?'chiều':H<22?'tối':'đêm';
  let h12=H%12;if(h12===0)h12=12;
  return h12+' giờ'+(M?' '+M:'')+' '+pod;
}
function stepperHtml(id,label){
  return '<div class="tstep" id="'+id+'" role="group" aria-label="'+label+'">'+
    '<div class="tcol"><button type="button" data-d="60" aria-label="Tăng giờ">+</button><input class="tin" data-k="h" inputmode="numeric" maxlength="2" aria-label="Giờ"><button type="button" data-d="-60" aria-label="Giảm giờ">−</button></div>'+
    '<span class="tcolon">:</span>'+
    '<div class="tcol"><button type="button" data-d="5" aria-label="Tăng phút">+</button><input class="tin" data-k="m" inputmode="numeric" maxlength="2" aria-label="Phút"><button type="button" data-d="-5" aria-label="Giảm phút">−</button></div>'+
    '<span class="tword" data-w></span></div>';
}
function bindStepper(id,value,onChange){
  const root=document.getElementById(id);
  const hh=root.querySelector('[data-k="h"]'),mm=root.querySelector('[data-k="m"]'),word=root.querySelector('[data-w]');
  let cur=toMin(/^\d{1,2}:\d{2}$/.test(value)?value:'07:00');
  const show=()=>{hh.value=pad(Math.floor(cur/60));mm.value=pad(cur%60);word.textContent=timeWord(fromMin(cur))};
  const set=(m,fire)=>{cur=((m%1440)+1440)%1440;show();if(fire!==false&&onChange)onChange(fromMin(cur))};
  root.addEventListener('click',e=>{const b=e.target.closest('[data-d]');if(b)set(cur+Number(b.dataset.d))});
  const fromInputs=()=>set(Math.max(0,Math.min(23,parseInt(hh.value,10)||0))*60+Math.max(0,Math.min(59,parseInt(mm.value,10)||0)));
  [hh,mm].forEach(i=>{i.addEventListener('change',fromInputs);i.addEventListener('focus',()=>i.select())});
  show();
  return {get:()=>fromMin(cur),set:v=>set(toMin(v),false)};
}
function chipsHtml(id,opts,val,cls){
  return '<div class="wchips '+(cls||'')+'" id="'+id+'" role="radiogroup">'+opts.map(o=>{
    const on=String(o[0])===String(val);
    return '<button type="button" class="wchip'+(on?' on':'')+'" data-v="'+esc(o[0])+'" role="radio" aria-checked="'+on+'">'+esc(o[1])+'</button>';
  }).join('')+'</div>';
}
function bindChips(id,onPick){
  const root=document.getElementById(id);
  root.addEventListener('click',e=>{
    const b=e.target.closest('[data-v]');if(!b)return;
    root.querySelectorAll('.wchip').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on))});
    onPick(b.dataset.v);
  });
}
const DUR_OPTS=[[15,'15 phút'],[30,'30 phút'],[45,'45 phút'],[60,'1 giờ'],[90,'1,5 giờ'],[120,'2 giờ'],[180,'3 giờ']];
function durHtml(px,val){
  val=val||30;
  const o=DUR_OPTS.some(x=>x[0]===val)?DUR_OPTS:DUR_OPTS.concat([[val,leadText(val)]]).sort((a,b)=>a[0]-b[0]);
  return '<div class="field"><label>Kéo dài</label><input type="hidden" id="'+px+'-dur" value="'+val+'">'+chipsHtml(px+'-durc',o,val)+'</div>';
}
function bindDur(px,onPick){const h=document.getElementById(px+'-dur');bindChips(px+'-durc',v=>{h.value=v;if(onPick)onPick(+v)})}
const LEAD_OPTS=[[0,'Đúng giờ'],[10,'10 phút'],[30,'30 phút'],[60,'1 giờ'],[120,'2 giờ'],[1440,'1 ngày']];
const REP_OPTS=[['none','Một lần'],['daily','Hằng ngày'],['weekly','Hằng tuần']];
const TIME_QUICK=['06:00','07:00','09:00','12:00','15:00','19:00','21:00'];
const dayPlus=n=>{const d=new Date();d.setDate(d.getDate()+n);return dKey(d)};
const shortDay=k=>{const d=new Date(k+'T00:00:00');return WDS[d.getDay()]+', '+d.getDate()+'/'+(d.getMonth()+1)};
/** Khối "Ngày, Giờ, Nhắc trước, Lặp lại". Giá trị nằm trong 3 ô ẩn #px-when, #px-lead, #px-rep nên mã cũ đọc được như trước. */
function whenBlockHtml(when,lead,repeat,px){
  lead=lead||0;repeat=repeat||'none';
  const lo=LEAD_OPTS.some(o=>o[0]===lead)?LEAD_OPTS:LEAD_OPTS.concat([[lead,leadText(lead)]]);
  return '<div class="wblock" id="'+px+'-wb">'+
    '<input type="hidden" id="'+px+'-when" value="'+esc(when)+'"><input type="hidden" id="'+px+'-lead" value="'+lead+'"><input type="hidden" id="'+px+'-rep" value="'+esc(repeat)+'">'+
    '<div class="field"><label>Ngày</label><div class="wchips" id="'+px+'-days"></div><p class="dhint wlab" id="'+px+'-dlab"></p></div>'+
    '<div class="field"><label>Giờ</label>'+stepperHtml(px+'-step','Giờ nhắc')+'<div class="wchips wpre" id="'+px+'-pre"></div><p class="dhint wwarn" id="'+px+'-warn"></p></div>'+
    '<div class="field"><label>Nhắc trước</label>'+chipsHtml(px+'-leadc',lo,lead)+'</div>'+
    '<div class="field"><label>Lặp lại</label>'+chipsHtml(px+'-repc',REP_OPTS,repeat,'seg3')+'</div></div>';
}
function bindWhenBlock(px){
  const hid=document.getElementById(px+'-when'),leadH=document.getElementById(px+'-lead'),repH=document.getElementById(px+'-rep');
  const parts=(hid.value||'').split('T');
  let date=/^\d{4}-\d{2}-\d{2}$/.test(parts[0])?parts[0]:dayPlus(0),time=/^\d{2}:\d{2}$/.test(parts[1]||'')?parts[1]:'09:00';
  const days=document.getElementById(px+'-days'),pre=document.getElementById(px+'-pre');
  const paint=()=>{
    const opts=[[dayPlus(0),'Hôm nay'],[dayPlus(1),'Ngày mai'],[dayPlus(2),'Ngày kia']];
    const known=opts.some(o=>o[0]===date);
    days.innerHTML=opts.map(o=>'<button type="button" class="wchip'+(o[0]===date?' on':'')+'" data-v="'+o[0]+'">'+o[1]+'</button>').join('')+
      '<button type="button" class="wchip'+(known?'':' on')+'" data-pick>📅 '+(known?'Chọn ngày':shortDay(date))+'</button>'+
      '<input type="date" class="wdate" value="'+date+'" aria-label="Chọn ngày khác" tabindex="-1">';
    document.getElementById(px+'-dlab').textContent=fullDay(date);
    pre.innerHTML=TIME_QUICK.map(t=>'<button type="button" class="wchip'+(t===time?' on':'')+'" data-v="'+t+'">'+t+'</button>').join('');
    const past=repH.value==='none'&&new Date(date+'T'+time+':00')<new Date();
    document.getElementById(px+'-warn').textContent=past?'Giờ này đã qua rồi, bạn chọn lại nhé.':'';
  };
  const fire=()=>{hid.value=date+'T'+time;hid.dispatchEvent(new Event('change',{bubbles:true}));paint()};
  const st=bindStepper(px+'-step',time,v=>{time=v;fire()});
  days.addEventListener('click',e=>{
    const b=e.target.closest('[data-v]');
    if(b){date=b.dataset.v;fire();return}
    if(e.target.closest('[data-pick]')){
      const inp=days.querySelector('.wdate');
      try{inp.showPicker();return}catch(err){}
      inp.classList.add('show');inp.focus();
    }
  });
  days.addEventListener('change',e=>{if(e.target.classList.contains('wdate')&&/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){date=e.target.value;fire()}});
  pre.addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;time=b.dataset.v;st.set(time);fire()});
  bindChips(px+'-leadc',v=>{leadH.value=v;leadH.dispatchEvent(new Event('change',{bubbles:true}))});
  bindChips(px+'-repc',v=>{repH.value=v;repH.dispatchEvent(new Event('change',{bubbles:true}));paint()});
  paint();
}

/* ---------- chia lượng nước uống ---------- */
const WATER_PRE=[[500,'500 ml'],[1000,'1 lít'],[1500,'1,5 lít'],[2000,'2 lít'],[2500,'2,5 lít']];
let waterRefresh=null,hfRender=null;
const totalText=ml=>(ml>=1000&&ml%250===0?String(ml/1000).replace('.',',')+' lít':ml+' ml');
const roundNowMin=()=>{const d=new Date();return fromMin(Math.min(1435,Math.ceil((d.getHours()*60+d.getMinutes())/5)*5))};
function waterInit(p){
  const h=p.habit,ws=h.waterSpec;
  const isW=/nuoc/.test(norm(p.title))||p.emoji==='💧'||!!h.ml;
  const w={on:isW,total:2000,count:8,mode:'auto',from:'13:00',to:'17:00',touched:false};
  if(!isW)return w;
  w.total=h.ml||(ws?ws.count*250:2000);
  w.count=ws?ws.count:Math.max(1,Math.round(w.total/250));
  if(ws){
    w.touched=true;
    const ex=x=>/^\d{2}:\d{2}$/.test(x);
    if(ex(ws.to)&&(ex(ws.from)||ws.from==='now')){w.mode='window';w.from=ex(ws.from)?ws.from:roundNowMin();w.to=ws.to}
    else if(ws.to==='bed'&&ex(ws.from)){w.mode='window';w.from=ws.from;w.to=profileBed()}
  }
  return w;
}
function waterTimes(w){
  if(w.mode==='window')return windowTimes(w.count,toMin(w.from),toMin(w.to));
  return calcSpread({count:w.count,from:hf.once?'now':'wake',to:'bed'});
}
function applyWater(){
  const w=hf.water;
  if(!w.on){hf.portionMl=null;hf.waterMl=null;return}
  hf.times=waterTimes(w);
  hf.spread=(w.mode==='auto'&&!hf.once)?{count:w.count,from:'wake',to:'bed'}:null;
  hf.portionMl=Math.round(w.total/w.count);hf.waterMl=w.total;
}
function waterHtml(w){
  return '<div class="waterbox" id="wt">'+
    '<label class="wsw"><input type="checkbox" id="wt-on"'+(w.on?' checked':'')+'><span>💧 Chia lượng nước uống</span></label>'+
    '<div id="wt-body"'+(w.on?'':' hidden')+'>'+
    '<div class="field"><label>Tổng lượng cả ngày</label><div class="serv" style="margin:0 0 8px"><span id="wt-total"></span><div class="qs"><button type="button" data-t="-250" aria-label="Giảm 250 ml">−</button><button type="button" data-t="250" aria-label="Tăng 250 ml">+</button></div></div><div class="wchips" id="wt-pre"></div></div>'+
    '<div class="field"><label>Chia làm</label><div class="serv" style="margin:0"><span><b id="wt-count"></b> lần</span><div class="qs"><button type="button" data-c="-1" aria-label="Giảm số lần">−</button><button type="button" data-c="1" aria-label="Tăng số lần">+</button></div></div></div>'+
    '<div class="field"><label>Khung giờ</label>'+chipsHtml('wt-mode',[['auto','Tự động cả ngày'],['window','Chọn giờ']],w.mode,'seg3')+
    '<div id="wt-win"'+(w.mode==='window'?'':' hidden')+'><div class="two" style="margin-top:10px"><div><span class="wl2">Từ</span>'+stepperHtml('wt-from','Từ giờ')+'</div><div><span class="wl2">Đến</span>'+stepperHtml('wt-to','Đến giờ')+'</div></div></div></div>'+
    '<div class="wsum" id="wt-sum"></div></div></div>';
}
function bindWater(){
  const w=hf.water;
  bindStepper('wt-from',w.from,v=>{w.from=v;refresh()});
  bindStepper('wt-to',w.to,v=>{w.to=v;refresh()});
  const refresh=()=>{
    applyWater();
    $('#wt-total').textContent=totalText(w.total);
    $('#wt-count').textContent=w.count;
    $('#wt-pre').innerHTML=WATER_PRE.map(o=>'<button type="button" class="wchip'+(o[0]===w.total?' on':'')+'" data-v="'+o[0]+'">'+o[1]+'</button>').join('');
    $('#wt-win').hidden=w.mode!=='window';
    $('#wt-body').hidden=!w.on;
    const tf=document.getElementById('hf-tf');if(tf)tf.hidden=w.on;     // đang chia nước thì giờ nhắc do Remi tự tính
    if(w.on){
      const per=Math.round(w.total/w.count);
      $('#wt-sum').innerHTML='<b>Mỗi lần '+(w.total%w.count?'khoảng ':'')+per+' ml</b><span>'+(w.mode==='auto'?'Chia đều từ '+(hf.once?'bây giờ':'lúc bạn thức dậy')+' đến giờ đi ngủ. ':'')+'Nhắc lúc '+hf.times.join(', ')+'</span>';
    }
  };
  waterRefresh=refresh;
  $('#wt-on').onchange=e=>{w.on=e.target.checked;if(w.on&&!w.touched)w.count=Math.max(1,Math.round(w.total/250));refresh();if(!w.on&&hfRender)hfRender()};
  $('#wt-pre').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;w.total=Number(b.dataset.v);if(!w.touched)w.count=Math.max(1,Math.round(w.total/250));refresh()});
  $('#wt-body').addEventListener('click',e=>{
    const t=e.target.closest('[data-t]');
    if(t){w.total=Math.max(250,Math.min(6000,w.total+Number(t.dataset.t)));if(!w.touched)w.count=Math.max(1,Math.round(w.total/250));refresh();return}
    const c=e.target.closest('[data-c]');
    if(c){w.count=Math.max(1,Math.min(12,w.count+Number(c.dataset.c)));w.touched=true;refresh()}
  });
  bindChips('wt-mode',v=>{w.mode=v;refresh()});
  refresh();
}


function openSheet(p,mode){
  draft=p;
  const sh=$('#sheet');
  const note=p.assumption||p.summary;
  let h='<div class="grab"></div>';
  if(mode!=='manual')h+='<div class="understood"><span aria-hidden="true">✨</span><span>'+esc(note||(p.intent==='habit'?(p.habit&&p.habit.recurring?'Một thói quen lặp lại.':'Chỉ nhắc trong hôm nay.'):'Một việc cần nhớ.'))+(p.engine==='local'?'<small class="eng">'+(p.why?'AI chưa dùng được nên Remi đọc ngay trên máy':'Đọc ngay trên máy, không gửi đi đâu')+'</small>':'')+'</span></div>';
  h+='<div class="field"><label for="f-title">Tên</label><input class="title-in" id="f-title" value="'+esc(p.emoji+' '+p.title)+'"></div>';
  if(p.intent==='task'){
    h+=whenBlockHtml(p.when,p.leadMin,p.repeat,'f');
    h+=durHtml('f',p.durMin);
    if(p.shopping)h+=shopHtml(p);
    if(!p.shopping&&p.checklist.length){
      h+='<div class="blk"><h4>Cần chuẩn bị ('+p.checklist.length+' mục)</h4>'+p.checklist.map(c=>'<div class="li"><span>'+esc(c.item)+'</span><span>'+esc(c.qty)+'</span></div>').join('')+'</div>';
    }
    if(p.tips.length){
      h+='<div class="blk"><h4>Mẹo từ Remi</h4><ul class="tips">'+p.tips.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div>';
    }
  }else{
    h+=habitFormHtml(p);
  }
  if(mode==='manual')h+='<button class="aibtn" id="s-ai" type="button">✨ Nhờ AI điền giúp</button>';
  h+='<div class="sbtns"><button class="sec" id="s-cancel" type="button">Huỷ</button><button class="pri" id="s-ok" type="button">'+(p.intent==='habit'?'Bắt đầu thói quen':'Thêm vào lịch')+'</button></div>';
  sh.innerHTML=h;
  document.body.classList.add('sheet-open');
  if(p.intent==='task')bindWhenBlock('f');
  if(p.intent==='task')bindDur('f');
  $('#s-cancel').onclick=closeSheet;
  $('#s-ok').onclick=confirmDraft;
  if(p.intent==='habit')initHabitForm();
  if(p.intent==='task'&&p.shopping)initShop();
  if($('#s-ai'))$('#s-ai').onclick=()=>{const v=splitTitle($('#f-title').value,'').title;if(v==='Việc mới'){$('#f-title').focus();return}closeSheet();submit(v)};
  if(mode==='manual')setTimeout(()=>{const f=$('#f-title');if(f){f.focus();const l=f.value.length;f.setSelectionRange(l,l)}},300);
}
const DAY_ORDER=[1,2,3,4,5,6,0],DAY_LABEL={1:'T2',2:'T3',3:'T4',4:'T5',5:'T6',6:'T7',0:'CN'};
const TIME_PRESETS=[['Sáng','07:00'],['Trưa','12:00'],['Chiều','17:00'],['Tối','21:00']];
const EMOJI_GUESS=[[/nước/i,'💧'],[/giãn|yoga|thiền|duỗi/i,'🧘'],[/chạy|đi bộ|cardio/i,'🏃'],[/gym|tập|plank|hít đất/i,'💪'],[/đọc|sách/i,'📖'],[/thuốc|vitamin/i,'💊'],[/ngủ/i,'😴'],[/(^|\s)ăn|rau|trái cây|hoa quả/i,'🍎'],[/viết|nhật ký/i,'✍️'],[/dọn|lau nhà|quét/i,'🧹'],[/học|từ vựng|tiếng anh/i,'📚'],[/đàn|guitar|nhạc/i,'🎸']];
function guessEmoji(t){for(let i=0;i<EMOJI_GUESS.length;i++){if(EMOJI_GUESS[i][0].test(t))return EMOJI_GUESS[i][1]}return null}
let hf=null;
let shop=null;
function servingsHtml(id,n){
  return '<div class="serv"><span>Số người ăn</span><div class="qs"><button type="button" data-sv="-1" aria-label="Giảm số người ăn">−</button><b id="'+id+'" aria-live="polite">'+n+'</b><button type="button" data-sv="1" aria-label="Tăng số người ăn">+</button></div></div>';
}
function qrowHtml(i,name,qty){
  const can=canStep(qty);
  return '<div class="qrow" data-i="'+i+'"><span class="qn">'+esc(name)+'</span><div class="qs">'+
    '<button type="button" data-q="-1" aria-label="Giảm '+esc(name)+'"'+(can?'':' disabled')+'>−</button>'+
    '<input class="qv" value="'+esc(qty||'')+'" maxlength="24" aria-label="Số lượng '+esc(name)+'">'+
    '<button type="button" data-q="1" aria-label="Tăng '+esc(name)+'"'+(can?'':' disabled')+'>+</button></div>'+
    '<button type="button" class="lx" data-rm aria-label="Bỏ '+esc(name)+'">×</button></div>';
}
const CATALOG=[
  ['Thịt, cá, trứng',['Thịt ba chỉ','Thịt bò','Thịt heo xay','Sườn heo','Thịt gà','Đùi gà','Cánh gà','Cá','Tôm','Mực','Trứng gà','Đậu hũ','Xúc xích','Lạp xưởng']],
  ['Rau củ',['Hành tây','Hành lá','Tỏi','Gừng','Sả','Ớt','Cà chua','Khoai tây','Khoai lang','Cà rốt','Bông cải xanh','Bắp cải','Cải thìa','Rau muống','Xà lách','Dưa leo','Bí đỏ','Cà tím','Đậu que','Ớt chuông','Nấm','Giá đỗ','Ngò rí','Rau thơm','Chanh','Chuối','Táo','Cam']],
  ['Gia vị',['Muối','Đường','Nước mắm','Nước tương','Dầu ăn','Dầu hào','Tiêu xay','Hạt nêm','Bột ngọt','Bột cà ri','Nước cốt dừa','Bột nghệ','Ngũ vị hương','Giấm','Tương ớt','Tương cà','Lá chanh','Hoa hồi','Quế','Bột ớt']],
  ['Khác',['Gạo','Mì gói','Bún','Phở','Bánh mì','Sữa','Bơ','Phô mai','Bột mì','Bột năng','Đậu phộng','Nước suối','Nước ngọt','Giấy ăn','Túi rác']]
];
const norm=x=>String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const MY_GROUPS=['Lần trước bạn mua','Remi gợi ý','Bạn đã thêm'];
function shopItems(p){
  const out=[],seen={},cat={};
  CATALOG.forEach(g=>g[1].forEach(n=>{cat[norm(n)]=1}));
  const add=(item,qty,group)=>{const k=norm(String(item).trim());if(!k||seen[k])return;seen[k]=1;out.push({item:String(item).trim(),qty:qty||'',group:group,on:false})};
  const rec=dishRecord(findDish(p.title)),base=p.servings||4;
  if(rec)rec.items.forEach(x=>add(x.item,scaleQty(x.qty,rec.s?base/rec.s:1),MY_GROUPS[0]));
  p.checklist.forEach(c=>add(c.item,c.qty,MY_GROUPS[1]));
  Object.keys(state.pantry).map(k=>state.pantry[k]).sort((a,b)=>b.n-a.n).forEach(e=>{if(!cat[norm(e.name)])add(e.name,'',MY_GROUPS[2])});
  CATALOG.forEach(g=>g[1].forEach(n=>add(n,'',g[0])));
  return out;
}
function shopHtml(p){
  shop={servings:p.servings||4,items:shopItems(p)};
  return '<div class="blk shop"><h4>Danh sách đi chợ <span class="sub" id="sh-n"></span></h4>'+servingsHtml('sh-sv',shop.servings)+'<div class="qlist" id="sh-sel"></div>'+
    '<h4 style="margin-top:14px">Thêm nguyên liệu</h4>'+
    '<div class="shopbox"><div class="sbar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'+
    '<input id="sh-q" type="text" autocomplete="off" enterkeyhint="done" maxlength="40" aria-label="Tìm nguyên liệu"></div>'+
    '<div class="slist" id="sh-list"></div></div></div>';
}
function initShop(){
  const q=$('#sh-q'),list=$('#sh-list');
  const r=()=>{
    const on=shop.items.filter(x=>x.on);
    $('#sh-n').textContent=on.length?on.length+' món':'';
    $('#sh-sel').innerHTML=on.length?on.map(x=>qrowHtml(shop.items.indexOf(x),x.item,x.qty)).join(''):'<p class="dhint" style="margin:6px 0 0">Chưa có món nào. Chạm dấu + ở bên dưới để thêm.</p>';
    const raw=q.value.trim(),nq=norm(raw);
    const exact=shop.items.some(x=>norm(x.item)===nq);
    let html='';
    if(raw&&!exact)html+='<button type="button" class="srow new" data-add="1"><span class="plus">+</span><span class="sname">Thêm “'+esc(raw)+'” vào danh sách</span></button>';
    let last='',n=0;
    shop.items.forEach((x,i)=>{
      if(nq&&norm(x.item).indexOf(nq)<0)return;
      n++;
      if(x.group!==last){html+='<div class="shead">'+esc(x.group)+'</div>';last=x.group}
      html+='<button type="button" class="srow'+(x.on?' on':'')+'" data-i="'+i+'"><span class="plus">'+(x.on?'✓':'+')+'</span><span class="sname">'+esc(x.item)+'</span>'+(x.qty?'<span class="sqty">'+esc(x.qty)+'</span>':'')+'</button>';
    });
    if(!html)html='<p class="dhint" style="padding:14px">Không tìm thấy.</p>';
    const sc=list.scrollTop;list.innerHTML=html;list.scrollTop=sc;
  };
  const create=raw=>{
    const it={item:raw,qty:'',group:MY_GROUPS[2],on:true};
    let at=shop.items.findIndex(x=>MY_GROUPS.indexOf(x.group)<0);
    if(at<0)at=shop.items.length;
    shop.items.splice(at,0,it);
    pantryAdd(raw);save();
  };
  r();
  q.addEventListener('input',()=>{list.scrollTop=0;r()});
  q.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    e.preventDefault();
    const raw=q.value.trim();if(!raw)return;
    const ex=shop.items.find(x=>norm(x.item)===norm(raw));
    if(ex)ex.on=true;else create(raw);
    q.value='';r();
  });
  list.onclick=e=>{
    const b=e.target.closest('.srow');if(!b)return;
    if(b.dataset.add){const raw=q.value.trim();if(raw){create(raw);q.value='';r()}return}
    const it=shop.items[Number(b.dataset.i)];if(it){it.on=!it.on;r()}
  };
  $('#sh-sel').onclick=e=>{
    const row=e.target.closest('.qrow');if(!row)return;
    const it=shop.items[Number(row.dataset.i)];if(!it)return;
    const qb=e.target.closest('[data-q]');
    if(qb){it.qty=stepQty(it.qty,Number(qb.dataset.q));r();return}
    if(e.target.closest('[data-rm]')){it.on=false;r()}
  };
  // Gõ tay số lượng: lưu ngay, chỉ bật/tắt nút +/- tại chỗ để không làm mất con trỏ
  $('#sh-sel').addEventListener('input',e=>{
    if(!e.target.classList.contains('qv'))return;
    const row=e.target.closest('.qrow'),it=shop.items[Number(row.dataset.i)];if(!it)return;
    it.qty=e.target.value;
    row.querySelectorAll('[data-q]').forEach(b=>{b.disabled=!canStep(it.qty)});
  });
  $('#sh-sel').addEventListener('change',e=>{if(e.target.classList.contains('qv'))r()});
  // Đổi số người ăn: co giãn mọi định lượng theo tỉ lệ
  document.querySelector('.serv').addEventListener('click',e=>{
    const b=e.target.closest('[data-sv]');if(!b)return;
    const next=Math.max(1,Math.min(20,shop.servings+Number(b.dataset.sv)));
    if(next===shop.servings)return;
    const ratio=next/shop.servings;
    shop.items.forEach(x=>{x.qty=scaleQty(x.qty,ratio)});
    shop.servings=next;$('#sh-sv').textContent=next;r();
  });
}
function habitFormHtml(p){
  hf={times:p.habit.times.slice(),days:p.habit.days.slice(),once:!p.habit.recurring,spread:p.habit.spread||null,water:waterInit(p),portionMl:null,waterMl:null};
  if(hf.water.on)applyWater();
  return waterHtml(hf.water)+'<div class="field" id="hf-tf"'+(hf.water.on?' hidden':'')+'><label>Nhắc lúc</label><div class="chips" id="hf-times"></div>'+
    '<p class="dhint" id="hf-sp" style="margin:6px 0 0"></p>'+
    '<div class="tones" id="hf-presets" style="margin-top:10px"></div>'+
    '<div class="trow2">'+stepperHtml('hf-step','Giờ nhắc')+'<button type="button" class="addt" id="hf-add">Thêm giờ</button></div></div>'+
    '<div class="field"><label>Lặp lại</label><div class="seg" id="hf-seg"><button type="button" data-o="1">Chỉ hôm nay</button><button type="button" data-o="0">Lặp lại</button></div>'+
    '<div class="days" id="hf-days" style="margin-top:10px"></div><p class="dhint" id="hf-dhint"></p></div>';
}
function initHabitForm(){
  const rTimes=()=>{
    hf.times.sort();
    $('#hf-times').innerHTML=hf.times.length?hf.times.map(t=>'<button type="button" class="chip lead tchip" data-t="'+t+'" aria-label="Bỏ giờ '+t+'">'+t+' ×</button>').join(''):'<span class="chip">Chưa chọn giờ</span>';
    $('#hf-presets').innerHTML=TIME_PRESETS.map(x=>'<button type="button" class="tone'+(hf.times.indexOf(x[1])>=0?' on':'')+'" data-p="'+x[1]+'">'+x[0]+' '+x[1]+'</button>').join('');
    $('#hf-sp').textContent=hf.spread?'Tự chia '+hf.spread.count+' lần từ lúc bạn thức dậy đến '+(hf.spread.to==='bed'?profileBed():hf.spread.to)+'. Chỉnh giờ sẽ tắt chế độ tự chia.':'';
  };
  const rDays=()=>{
    $('#hf-seg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',(b.dataset.o==='1')===hf.once));
    $('#hf-days').hidden=hf.once;
    $('#hf-days').innerHTML=DAY_ORDER.map(d=>'<button type="button" class="day'+(hf.days.indexOf(d)>=0?' on':'')+'" data-d="'+d+'" aria-pressed="'+(hf.days.indexOf(d)>=0)+'">'+DAY_LABEL[d]+'</button>').join('');
    $('#hf-dhint').textContent=hf.once?'Chỉ nhắc trong hôm nay, mai tự xoá.':(hf.days.length?daysText(hf.days):'Chọn ít nhất một ngày');
  };
  rTimes();rDays();
  hfRender=()=>{rTimes();rDays()};
  const hst=bindStepper('hf-step','07:00');
  bindWater();
  $('#hf-times').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;hf.times=hf.times.filter(x=>x!==b.dataset.t);hf.spread=null;rTimes()};
  $('#hf-presets').onclick=e=>{
    const b=e.target.closest('[data-p]');if(!b)return;
    const t=b.dataset.p;
    hf.times=hf.times.indexOf(t)>=0?hf.times.filter(x=>x!==t):hf.times.concat(t);
    hf.spread=null;rTimes();
  };
  $('#hf-add').onclick=()=>{
    const v=hst.get();
    if(hf.times.indexOf(v)<0){hf.times.push(v);hf.spread=null;rTimes()}
  };
  $('#hf-seg').onclick=e=>{const b=e.target.closest('[data-o]');if(!b)return;hf.once=b.dataset.o==='1';rDays();if(waterRefresh)waterRefresh()};
  $('#hf-days').onclick=e=>{
    const b=e.target.closest('[data-d]');if(!b)return;
    const d=Number(b.dataset.d);
    hf.days=hf.days.indexOf(d)>=0?hf.days.filter(x=>x!==d):hf.days.concat(d);
    rDays();
  };
}
let openTaskId=null,fromCal=false;
function closeSheet(){document.body.classList.remove('sheet-open');setTimeout(()=>{if(!document.body.classList.contains('sheet-open'))$('#sheet').scrollTop=0},340);draft=null;fromCal=false;if(openTaskId){openTaskId=null;save();render();tick()}}
function splitTitle(v,fallbackEmoji){
  v=v.trim();
  const m=v.match(/^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*(.*)$/u);
  return m?{emoji:m[1],title:m[2]||'Việc mới'}:{emoji:fallbackEmoji,title:v||'Việc mới'};
}
function confirmDraft(){
  if(!draft)return;
  const p=draft;const st=splitTitle($('#f-title').value,p.emoji);
  if(p.intent==='habit'){
    const emoji=(st.emoji==='🎯'&&guessEmoji(st.title))||st.emoji;
    const hb={id:uid(),title:st.title,emoji:emoji,times:hf.times.length?hf.times:['07:00'],days:hf.days.length?hf.days:[0,1,2,3,4,5,6],log:{}};
    if(hf.once){hb.once=true;hb.date=dKey(new Date())}
    else if(hf.spread){hb.spread=hf.spread}
    if(hf.portionMl){hb.portionMl=hf.portionMl;hb.waterMl=hf.waterMl}
    state.habits.push(hb);
    tab='habits';
  }else{
    const w=$('#f-when').value||p.when;
    const cl=(p.shopping&&shop)?shop.items.filter(x=>x.on).map(x=>({item:x.item,qty:x.qty,done:false})):p.checklist;
    state.tasks.push({id:uid(),title:st.title,emoji:st.emoji,when:w,durMin:parseInt($('#f-dur').value,10)||30,leadMin:parseInt($('#f-lead').value,10)||0,repeat:$('#f-rep').value,
      summary:p.summary,checklist:cl,tips:p.tips,shop:!!p.shopping,servings:(p.shopping&&shop)?shop.servings:undefined,done:false});
    if(p.shopping&&cl.length){cl.forEach(x=>pantryAdd(x.item));saveDish(st.title,cl,shop&&shop.servings)}
    const d=new Date(w);
    if(fromCal){calSel=dKey(d);calY=d.getFullYear();calM=d.getMonth();tab='cal'}
    else tab=dKey(d)<=dKey(new Date())?'today':'soon';
  }
  $('#ta').value='';
  closeSheet();save();render();tick();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- render ---------- */
function daysText(d){
  if(d.length===7)return 'Hằng ngày';
  const k=d.slice().sort().join(',');
  if(k==='1,2,3,4,5')return 'Ngày thường';
  if(k==='0,6')return 'Cuối tuần';
  return DAY_ORDER.filter(x=>d.indexOf(x)>=0).map(x=>DAY_LABEL[x]).join(' ');
}
function habitDone(h){return Math.min(hTimes(h).length,h.log[dKey(new Date())]||0)}
/** Dòng "🔥 chuỗi ngày · tỉ lệ" cho thẻ thói quen. Một ngày tính là xong khi đủ số lần. */
function habitStreakLine(h){
  const S=window.RemiStats;
  if(!S||h.once)return '';
  const goal=hTimes(h).length;
  const days=Object.keys(h.log).filter(k=>(h.log[k]||0)>=goal);
  if(!days.length)return '';
  const today=new Date();
  const first=Object.keys(h.log).filter(k=>(h.log[k]||0)>0).sort()[0];
  const since=Math.round((new Date(dKey(today)+'T00:00:00')-new Date(first+'T00:00:00'))/86400000)+1;
  const s=S.habitStreak(days,h.days,today);
  const r=S.completionRate(days,h.days,Math.max(1,Math.min(7,since)),today);
  const parts=[];
  if(s.current>0)parts.push('🔥 '+s.current+' ngày liên tiếp');
  if(r.total>0)parts.push(r.pct+'% trong '+r.total+' ngày');
  return parts.length?'<p class="hstreak">'+esc(parts.join(' · '))+'</p>':'';
}
function ring(h){
  const pct=habitDone(h)/hTimes(h).length,C=2*Math.PI*28;
  return '<div class="ring"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="var(--line)" stroke-width="7"/>'+
    '<circle cx="32" cy="32" r="28" fill="none" stroke="var(--ok)" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+(C*pct).toFixed(1)+' '+C.toFixed(1)+'"/></svg><div class="e">'+esc(h.emoji)+'</div></div>';
}
function habitCard(h,full){
  const now=new Date(),ts=hTimes(h),goal=ts.length,done=habitDone(h),all=done>=goal;
  const onToday=habitActive(h,now);
  const pm=h.portionMl;
  const status=!onToday?'Hôm nay nghỉ':pm?(done*pm)+' / '+(goal*pm)+' ml hôm nay':goal===1?('Lúc '+ts[0]+', '+(all?'đã xong':'chưa làm')):done+' / '+goal+' lần hôm nay';
  let h2='<div class="hcard'+(full?' full':'')+'" data-hid="'+h.id+'" role="button" tabindex="0" aria-label="Mở chi tiết '+esc(h.title)+'"><div class="hhead">'+ring(h)+'<div><h3>'+esc(h.title)+'</h3><p>'+status+'</p>'+habitStreakLine(h)+'</div></div>';
  if(full){
    const nxt=onToday?ts.slice().sort().find(t=>{const [H,M]=t.split(':').map(Number);const a=new Date(now);a.setHours(H,M,0,0);return a>now}):null;
    h2+='<div class="chips">'+ts.slice().sort().map(t=>'<span class="chip'+(t===nxt?' lead':'')+'">'+esc(t)+'</span>').join('')+'<span class="chip ai">'+(h.once?'Chỉ hôm nay':daysText(h.days))+'</span>'+(h.spread?'<span class="chip ai">Tự chia theo giờ dậy</span>':'')+(pm?'<span class="chip ai">'+pm+' ml mỗi lần</span>':'')+'</div>';
    h2+='<p style="margin:0;color:var(--muted);font-size:13px">'+(!onToday?'Hôm nay là ngày nghỉ.':all?'Hôm nay bạn đã đủ rồi.':(nxt?'Nhắc tiếp theo lúc '+nxt+'.':'Hôm nay đã hết mốc nhắc.'))+'</p>';
  }
  h2+='<div class="hbtns">'+(all?'<button disabled>Đã đủ ✓</button>':'<button data-act="hadd" data-id="'+h.id+'" data-n="1">'+(pm?'Uống '+pm+' ml':'Xong'+(goal>1?' 1 lần':''))+'</button>');
  if(full&&done>0) h2+='<button class="ghost" data-act="hadd" data-id="'+h.id+'" data-n="-1" aria-label="Hoàn tác">−</button>';
  h2+='</div>';
  if(full) h2+='<button class="linkbtn" data-act="hdel" data-id="'+h.id+'">Xoá thói quen</button>';
  return h2+'</div>';
}
/* ---------- thống kê ---------- */
let statRange=7;
const waterMlOn=k=>state.habits.reduce((s,h)=>s+(h.portionMl?(h.log[k]||0)*h.portionMl:0),0);
const habitTimesOn=k=>state.habits.reduce((s,h)=>s+(h.portionMl?0:(h.log[k]||0)),0);
/** Tỉ lệ hoàn thành n ngày gần nhất, không tính những ngày trước khi thói quen có dữ liệu đầu tiên. */
function habitStats(h,n){
  const S=window.RemiStats;
  const goal=hTimes(h).length;
  const logged=Object.keys(h.log).filter(k=>(h.log[k]||0)>0).sort();
  if(!S||!logged.length)return null;
  const days=Object.keys(h.log).filter(k=>(h.log[k]||0)>=goal);
  const today=new Date();
  const since=Math.round((new Date(dKey(today)+'T00:00:00')-new Date(logged[0]+'T00:00:00'))/86400000)+1;
  return S.completionRate(days,h.days,Math.max(1,Math.min(n,since)),today);
}
function renderStats(){
  if(tab!=='stats')return;
  const S=window.RemiStats,host=$('#view-stats');
  if(!S)return;
  const n=statRange,today=new Date();
  let h='<h2>Thống kê</h2><div class="seg" id="st-seg">'+
    [[7,'7 ngày'],[30,'30 ngày']].map(o=>'<button type="button" class="'+(o[0]===n?'on':'')+'" data-act="strange" data-n="'+o[0]+'">'+o[1]+'</button>').join('')+'</div>';
  const water=S.series(n,waterMlOn,today),acts=S.series(n,habitTimesOn,today);
  const hasWater=water.some(p=>p.value>0),hasActs=acts.some(p=>p.value>0);
  if(!hasWater&&!hasActs){
    h+='<div class="empty"><b>Chưa có dữ liệu</b>Tick vài thói quen, biểu đồ sẽ hiện ở đây.</div>';
  }else{
    h+='<div class="stgrid">';
    if(hasWater){
      const tot=water.reduce((s,p)=>s+p.value,0),dn=water.filter(p=>p.value>0).length;
      h+='<section class="stcard"><h3>Nước uống mỗi ngày</h3><p class="dhint" style="margin:0">Trung bình '+fmtNum(Math.round(tot/dn))+' ml trong những ngày có uống</p>'+S.barChartSvg(water,{label:'Nước uống mỗi ngày'})+'</section>';
    }
    if(hasActs){
      const tot=acts.reduce((s,p)=>s+p.value,0);
      h+='<section class="stcard"><h3>Số lần làm thói quen</h3><p class="dhint" style="margin:0">Tổng '+tot+' lần trong '+n+' ngày</p>'+S.barChartSvg(acts,{label:'Số lần làm thói quen mỗi ngày'})+'</section>';
    }
    const rows=state.habits.filter(x=>!x.once).map(x=>({x:x,s:habitStats(x,n)})).filter(r=>r.s&&r.s.total>0);
    if(rows.length){
      h+='<section class="stcard"><h3>Tỉ lệ hoàn thành</h3>'+rows.map(r=>'<div class="prow"><div class="ptop"><span>'+esc(r.x.emoji)+' '+esc(r.x.title)+'</span><b>'+r.s.pct+'%</b></div><div class="pbar"><i style="width:'+r.s.pct+'%"></i></div><small>'+r.s.done+' / '+r.s.total+' ngày</small></div>').join('')+'</section>';
    }
    h+='</div>';
  }
  host.innerHTML=h;
}
/* ---------- huy hiệu (C3) ---------- */
function badgeList(){
  const S=window.RemiStats;
  return S?S.evaluateBadges(state.habits,new Date(),{goalOf:h=>hTimes(h).length}):[];
}
/** Mở khoá huy hiệu mới. Lần chạy đầu chỉ ghi nhận thầm những huy hiệu đã đạt từ trước (không báo). Trả về true nếu có thay đổi. */
function checkBadges(){
  const list=badgeList();
  if(!list.length)return false;
  const b=state.badges,now=Date.now(),fresh=[];
  list.forEach(x=>{if(x.earned&&!b.got[x.id]){b.got[x.id]=now;fresh.push(x)}});
  const first=!b.seeded;
  if(first)b.seeded=now;
  else fresh.forEach(x=>alertUser(x.emoji,'Huy hiệu mới: '+x.name,x.desc));
  return first||fresh.length>0;
}
function renderBadges(){
  if(tab!=='stats')return;
  const list=badgeList();
  if(!list.length)return;
  const got=state.badges.got;
  const n=list.filter(x=>got[x.id]||x.earned).length;
  let h='<h2 style="margin-top:22px">Huy hiệu<span class="sub">'+n+' / '+list.length+'</span></h2><div class="bgrid">';
  list.forEach(x=>{
    const on=!!(got[x.id]||x.earned),pct=Math.round(x.value/x.target*100);
    h+='<div class="bd'+(on?'':' off')+'"><div class="bi" aria-hidden="true">'+x.emoji+'</div><b>'+esc(x.name)+'</b><small>'+esc(x.desc)+'</small>'+
      (on?'<span class="bok">Đã mở khoá</span>':'<div class="pbar"><i style="width:'+pct+'%"></i></div><small>'+x.value+' / '+x.target+'</small>')+'</div>';
  });
  $('#view-stats').insertAdjacentHTML('beforeend',h+'</div>');
}
function taskCard(t){
  const d=t.when?new Date(t.when):null,now=new Date();
  const lead=d&&t.leadMin?new Date(d.getTime()-t.leadMin*60000):null;
  const late=d&&!t.done&&d<now;
  let chips='';
  if(late)chips+='<span class="chip late">Quá giờ</span>';
  if(lead)chips+='<span class="chip lead">Nhắc lúc '+hm(lead)+'</span>';
  if(t.repeat!=='none')chips+='<span class="chip">'+REPEAT[t.repeat]+'</span>';
  const L=t.checklist||[];
  if(L.length){const left=L.filter(c=>!c.done).length;chips+='<span class="chip ai">✨ '+(left?left+' mục cần chuẩn bị':'Đã chuẩn bị xong')+'</span>'}
  if(t.note&&t.note.trim())chips+='<span class="chip">📝 '+esc(t.note.trim().split('\n')[0].slice(0,26))+'</span>';
  return '<article class="task'+(t.done?' done':'')+'" data-id="'+t.id+'" tabindex="0" role="button" aria-label="Mở chi tiết '+esc(t.title)+'">'+
    '<div class="time"><b>'+(d?hm(d):'—')+'</b><span>'+(d?dayLabel(d):'Cả ngày')+'</span></div>'+
    '<div class="tbody"><h3>'+esc(t.emoji)+' '+esc(t.title)+'</h3>'+(chips?'<div class="chips">'+chips+'</div>':'')+'</div>'+
    '<button class="check" data-act="done" data-id="'+t.id+'" aria-label="'+(t.done?'Bỏ đánh dấu':'Đánh dấu hoàn thành')+'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></article>';
}
function sortTasks(a,b){return (a.when||'9')<(b.when||'9')?-1:1}

function render(){
  const now=new Date(),tk=dKey(now);
  /* header */
  const hr=now.getHours();
  $('#greet').textContent=(hr<11?'Chào buổi sáng':hr<14?'Chào buổi trưa':hr<18?'Chào buổi chiều':'Chào buổi tối')+(nm()?', '+nm():'');
  $('#me').textContent=(nm()||'?').charAt(0).toUpperCase();
  $('#dateline').textContent=WD[now.getDay()]+', ngày '+now.getDate()+' tháng '+(now.getMonth()+1);
  const upcoming=state.tasks.filter(t=>!t.done&&t.when&&new Date(t.when)>=now).sort(sortTasks)[0];
  $('#next').innerHTML=upcoming?'<span class="dot"></span><span>Tiếp theo: <b>'+hm(new Date(upcoming.when))+' '+esc(upcoming.title)+'</b></span>':'<span class="dot"></span><span>Chưa có việc nào sắp tới</span>';

  renderSleep();
  /* today */
  const todayTasks=state.tasks.filter(t=>!t.when||dKey(new Date(t.when))<=tk);
  const open=todayTasks.filter(t=>!t.done).sort(sortTasks),done=todayTasks.filter(t=>t.done).sort(sortTasks);
  let h='';
  if(me&&'Notification' in window&&'serviceWorker' in navigator){
    let perm='';try{perm=Notification.permission}catch(e){}
    if(perm!=='denied'&&!store.get('remi.push',false))h+='<div class="banner"><p>Bật thông báo để Remi nhắc bạn cả khi đã đóng app.</p><button data-act="notif">Bật</button></div>';
  }
  const hToday=state.habits.filter(x=>habitActive(x,now));
  $('#today-habits').innerHTML=hToday.length?'<h2>Thói quen hôm nay</h2><div class="hrow">'+hToday.map(x=>habitCard(x,false)).join('')+'</div>':'';
  h+='<h2>Việc hôm nay<span class="sub">'+open.length+' việc còn lại</span></h2>';
  h+=open.length?open.map(taskCard).join(''):'<div class="empty"><b>'+(done.length?'Xong hết rồi!':'Chưa có việc nào hôm nay')+'</b>'+(done.length?'Bạn đã hoàn thành mọi việc hôm nay.':'Chọn một mục ở trên hoặc gõ vào ô trống, Remi sẽ lo phần còn lại.')+'</div>';
  if(done.length)h+='<h2>Đã xong</h2>'+done.map(taskCard).join('');
  h=KUI.todayBanner()+h;
  $('#view-today').innerHTML=h;

  /* soon */
  const fut=state.tasks.filter(t=>t.when&&!t.done&&dKey(new Date(t.when))>tk).sort(sortTasks);
  let s='<h2>Sắp tới<span class="sub">'+fut.length+' việc</span></h2>';
  if(!fut.length)s+='<div class="empty"><b>Chưa có việc nào sắp tới</b>Thử nói: “Mai họp với khách lúc 9h30”.</div>';
  else{
    s+='<div class="daygrid">';let last='',openG=false;
    fut.forEach(t=>{const lb=dayLabel(new Date(t.when));if(lb!==last){if(openG)s+='</section>';s+='<section class="daygrp"><h3 class="daylbl">'+esc(lb)+'</h3>';openG=true;last=lb}s+=taskCard(t)});
    if(openG)s+='</section>';
    s+='</div>';
  }
  $('#view-soon').innerHTML=s;

  /* habits */
  let hb='<h2>Thói quen</h2>';
  hb+=state.habits.length?state.habits.map(x=>habitCard(x,true)).join(''):'<div class="empty"><b>Chưa có thói quen nào</b>Thử nói: “Nhắc tôi uống nước 2l mỗi ngày”.</div>';
  hb+='<button class="send" style="margin-top:6px" data-act="newhabit" type="button">Thêm thói quen</button>';
  $('#view-habits').innerHTML=hb;

  renderCal();renderStats();renderBadges();
  if(tab==='kitchen')KUI.render($('#view-kitchen'));
  ['today','soon','habits','cal','kitchen','stats'].forEach(k=>{$('#view-'+k).hidden=(k!==tab)});
  $('#quick').hidden=(tab!=='today');$('#sleep').hidden=(tab!=='today'||(state.sleep.awake&&!nearBed()));$('#suggest').hidden=(tab!=='today');$('#today-habits').hidden=(tab!=='today');document.body.dataset.tab=tab;
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
}

/* ---------- task detail sheet ---------- */
function syncDish(t){if(t.shop)saveDish(t.title,t.checklist,t.servings)}
function openTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  openTaskId=id;draft=null;
  const sh=$('#sheet');
  let h='<button class="sx" id="t-x" type="button" aria-label="Đóng">✕</button><div class="grab"></div>';
  h+='<div class="field" style="margin-top:0"><label for="t-title">Tên</label><input class="title-in" id="t-title" value="'+esc(t.emoji+' '+t.title)+'"></div>';
  h+='<label class="donechk"><input type="checkbox" id="t-chk"'+(t.done?' checked':'')+'><span>Đã hoàn thành</span></label>';
  h+=whenBlockHtml(t.when||toLocal(defaultWhen()),t.leadMin||0,t.repeat||'none','t');
  h+=durHtml('t',t.durMin);
  h+='<div class="blk"><h4>'+(t.shop?'Danh sách đi chợ':'Danh sách')+'</h4>'+(t.shop?servingsHtml('t-sv',t.servings||4):'')+'<div id="t-list"></div>'+
     '<div class="addrow"><input id="t-add" maxlength="40" aria-label="Thêm mục"><button type="button" class="addt" id="t-addb">Thêm</button></div></div>';
  h+='<div class="field"><label for="t-note">Ghi chú</label><textarea class="note" id="t-note" rows="3">'+esc(t.note||'')+'</textarea></div>';
  if((t.tips||[]).length)h+='<div class="blk"><h4>Mẹo từ Remi</h4><ul class="tips">'+t.tips.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>';
  if(t.shop)h+='<button class="aibtn" id="t-stock" type="button">🧺 Cất đồ đã mua vào tủ</button>';
  h+='<div class="sbtns"><button class="sec" id="t-del" type="button">Xoá</button><button class="pri" id="t-done" type="button">Xong</button></div>';
  sh.innerHTML=h;
  document.body.classList.add('sheet-open');
  bindWhenBlock('t');
  bindDur('t',v=>{t.durMin=v;save()});
  const rList=()=>{
    const L=t.checklist||[];
    $('#t-list').innerHTML=L.length?'<div class="lh"><span></span><span>Món</span><span>Số lượng</span><span></span></div>'+
      L.map((c,i)=>'<div class="lrow"><input type="checkbox" data-ti="'+i+'"'+(c.done?' checked':'')+' aria-label="Đã xong"><span class="ln'+(c.done?' d':'')+'">'+esc(c.item)+'</span><div class="qs"><button type="button" data-qm="'+i+'" aria-label="Giảm '+esc(c.item)+'"'+(canStep(c.qty)?'':' disabled')+'>−</button><input class="lq" data-qi="'+i+'" value="'+esc(c.qty||'')+'" maxlength="24" aria-label="Số lượng '+esc(c.item)+'"><button type="button" data-qp="'+i+'" aria-label="Tăng '+esc(c.item)+'"'+(canStep(c.qty)?'':' disabled')+'>+</button></div><button type="button" class="lx" data-xi="'+i+'" aria-label="Xoá '+esc(c.item)+'">×</button></div>').join(''):'<p class="dhint" style="margin:0 0 6px">Chưa có mục nào.</p>';
  };
  rList();
  $('#t-x').onclick=closeSheet;
  if($('#t-stock'))$('#t-stock').onclick=()=>{if(KUI.stockFromTask(t))rList()};
  $('#t-title').addEventListener('input',e=>{const st=splitTitle(e.target.value,t.emoji);t.emoji=st.emoji;t.title=st.title;save()});
  $('#t-when').addEventListener('change',e=>{if(e.target.value){t.when=e.target.value;save()}});
  $('#t-lead').addEventListener('change',e=>{t.leadMin=parseInt(e.target.value,10)||0;save()});
  $('#t-rep').addEventListener('change',e=>{t.repeat=e.target.value;save()});
  $('#t-note').addEventListener('input',e=>{t.note=e.target.value;save()});
  const lst=$('#t-list');
  lst.addEventListener('change',e=>{const i=e.target.dataset.ti;if(i===undefined)return;t.checklist[Number(i)].done=e.target.checked;save();rList()});
  lst.addEventListener('input',e=>{
    const i=e.target.dataset.qi;if(i===undefined)return;
    const c=t.checklist[Number(i)];c.qty=e.target.value;syncDish(t);save();
    e.target.closest('.lrow').querySelectorAll('[data-qm],[data-qp]').forEach(b=>{b.disabled=!canStep(c.qty)});
  });
  lst.addEventListener('click',e=>{
    const m=e.target.closest('[data-qm],[data-qp]');
    if(m){
      const i=Number(m.dataset.qm!==undefined?m.dataset.qm:m.dataset.qp),c=t.checklist[i];
      c.qty=stepQty(c.qty,m.dataset.qm!==undefined?-1:1);syncDish(t);save();rList();return;
    }
    const b=e.target.closest('[data-xi]');if(!b)return;
    t.checklist.splice(Number(b.dataset.xi),1);syncDish(t);save();rList();
  });
  const sv=document.querySelector('#t-sv');
  if(sv)sv.closest('.serv').addEventListener('click',e=>{
    const b=e.target.closest('[data-sv]');if(!b)return;
    const cur=t.servings||4,next=Math.max(1,Math.min(20,cur+Number(b.dataset.sv)));
    if(next===cur)return;
    (t.checklist||[]).forEach(c=>{c.qty=scaleQty(c.qty,next/cur)});
    t.servings=next;sv.textContent=next;syncDish(t);save();rList();
  });
  const add=()=>{
    const v=$('#t-add').value.trim();if(!v)return;
    t.checklist=t.checklist||[];
    if(!t.checklist.some(c=>c.item.toLowerCase()===v.toLowerCase()))t.checklist.push({item:v,qty:'',done:false});
    pantryAdd(v);syncDish(t);save();$('#t-add').value='';rList();$('#t-add').focus();
  };
  $('#t-addb').onclick=add;
  $('#t-add').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add()}});
  let armed=false;
  $('#t-del').onclick=()=>{
    if(!armed){armed=true;$('#t-del').textContent='Chạm lần nữa để xoá';return}
    state.tasks=state.tasks.filter(x=>x.id!==id);openTaskId=null;save();closeSheet();render();
  };
  $('#t-done').onclick=closeSheet;
  $('#t-chk').addEventListener('change',e=>{
    if(e.target.checked&&t.repeat!=='none'&&t.when){completeTask(id);closeSheet();return}
    t.done=e.target.checked;save();
  });
}

/* ---------- habit detail sheet ---------- */
function openHabit(id){
  const h=state.habits.find(x=>x.id===id);if(!h)return;
  openTaskId='habit';draft=null;
  const sh=$('#sheet');
  sh.innerHTML='<button class="sx" id="h-x" type="button" aria-label="Đóng">✕</button><div class="grab"></div>'+
    '<div class="field" style="margin-top:0"><label for="h-title">Tên</label><input class="title-in" id="h-title" value="'+esc(h.emoji+' '+h.title)+'"></div>'+
    '<div class="blk"><h4>Hôm nay</h4><div class="slots" id="h-slots"></div><p class="dhint" id="h-prog"></p></div>'+
    (h.portionMl?'<div class="serv"><span>Mỗi lần uống</span><div class="qs"><button type="button" data-pm="-50" aria-label="Giảm 50 ml">−</button><b id="h-pm">'+h.portionMl+' ml</b><button type="button" data-pm="50" aria-label="Tăng 50 ml">+</button></div></div>':'')+
    '<div class="field"><label>Nhắc lúc</label><div class="chips" id="h-times"></div><p class="dhint" id="h-sp" style="margin:6px 0 0"></p>'+
    '<div class="tones" id="h-presets" style="margin-top:10px"></div>'+
    '<div class="trow2">'+stepperHtml('h-step','Giờ nhắc')+'<button type="button" class="addt" id="h-add">Thêm giờ</button></div></div>'+
    '<div class="field"><label>Lặp lại</label><div class="seg" id="h-seg"><button type="button" data-o="1">Chỉ hôm nay</button><button type="button" data-o="0">Lặp lại</button></div>'+
    '<div class="days" id="h-days" style="margin-top:10px"></div><p class="dhint" id="h-dhint"></p></div>'+
    '<div class="field"><label for="h-note">Ghi chú</label><textarea class="note" id="h-note" rows="3">'+esc(h.note||'')+'</textarea></div>'+
    '<div class="sbtns"><button class="sec" id="h-del" type="button">Xoá</button><button class="pri" id="h-ok" type="button">Xong</button></div>';
  document.body.classList.add('sheet-open');
  let times=hTimes(h).slice().sort();
  const todayK=()=>dKey(new Date());
  const setTimes=()=>{
    times.sort();h.times=times.slice();h.spread=null;h.plan=null;
    const k=todayK();if((h.log[k]||0)>times.length)h.log[k]=times.length;
    save();
  };
  const rSlots=()=>{
    const now=new Date(),done=habitDone(h);
    if(!habitActive(h,now)){$('#h-slots').innerHTML='<span class="chip">Hôm nay nghỉ</span>';$('#h-prog').textContent='';return}
    $('#h-slots').innerHTML=times.map((t,i)=>'<button type="button" class="slot'+(i<done?' on':'')+'" data-s="'+i+'" aria-pressed="'+(i<done)+'"><span>'+(i<done?'✓':'')+'</span>'+t+'</button>').join('');
    $('#h-prog').textContent=done>=times.length?'Hôm nay bạn đã đủ rồi.':'Đã làm '+done+' / '+times.length+' lần. Chạm vào từng mốc để tick.';
  };
  const rTimes=()=>{
    $('#h-times').innerHTML=times.length?times.map(t=>'<button type="button" class="chip lead tchip" data-t="'+t+'" aria-label="Bỏ giờ '+t+'">'+t+' ×</button>').join(''):'<span class="chip">Chưa chọn giờ</span>';
    $('#h-presets').innerHTML=TIME_PRESETS.map(x=>'<button type="button" class="tone'+(times.indexOf(x[1])>=0?' on':'')+'" data-p="'+x[1]+'">'+x[0]+' '+x[1]+'</button>').join('');
    $('#h-sp').textContent=h.spread?'Giờ nhắc đang tự chia theo lúc bạn thức dậy. Chỉnh giờ sẽ tắt chế độ này.':'';
    rSlots();
  };
  const rDays=()=>{
    const once=!!h.once;
    $('#h-seg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',(b.dataset.o==='1')===once));
    $('#h-days').hidden=once;
    $('#h-days').innerHTML=DAY_ORDER.map(d=>'<button type="button" class="day'+(h.days.indexOf(d)>=0?' on':'')+'" data-d="'+d+'" aria-pressed="'+(h.days.indexOf(d)>=0)+'">'+DAY_LABEL[d]+'</button>').join('');
    $('#h-dhint').textContent=once?'Chỉ nhắc trong hôm nay, mai tự xoá.':(h.days.length?daysText(h.days):'Chọn ít nhất một ngày');
    rSlots();
  };
  rTimes();rDays();
  const hstep=bindStepper('h-step','07:00');
  $('#h-x').onclick=closeSheet;
  if(h.portionMl)document.querySelector('#h-pm').closest('.serv').addEventListener('click',e=>{const b=e.target.closest('[data-pm]');if(!b)return;h.portionMl=Math.max(50,Math.min(1000,h.portionMl+Number(b.dataset.pm)));h.waterMl=h.portionMl*hTimes(h).length;$('#h-pm').textContent=h.portionMl+' ml';save();rSlots()});$('#h-ok').onclick=closeSheet;
  $('#h-title').addEventListener('input',e=>{const st=splitTitle(e.target.value,h.emoji);h.emoji=st.emoji;h.title=st.title;save()});
  $('#h-note').addEventListener('input',e=>{h.note=e.target.value;save()});
  $('#h-slots').onclick=e=>{
    const b=e.target.closest('[data-s]');if(!b)return;
    const i=Number(b.dataset.s),done=habitDone(h);
    h.log[todayK()]=(i<done)?i:i+1;save();rSlots();
  };
  $('#h-times').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;times=times.filter(x=>x!==b.dataset.t);setTimes();rTimes()};
  $('#h-presets').onclick=e=>{
    const b=e.target.closest('[data-p]');if(!b)return;
    const t=b.dataset.p;
    times=times.indexOf(t)>=0?times.filter(x=>x!==t):times.concat(t);
    setTimes();rTimes();
  };
  $('#h-add').onclick=()=>{
    const v=hstep.get();
    if(times.indexOf(v)<0){times.push(v);setTimes();rTimes()}
  };
  $('#h-seg').onclick=e=>{
    const b=e.target.closest('[data-o]');if(!b)return;
    if(b.dataset.o==='1'){h.once=true;h.date=todayK()}else{delete h.once;delete h.date}
    save();rDays();
  };
  $('#h-days').onclick=e=>{
    const b=e.target.closest('[data-d]');if(!b)return;
    const d=Number(b.dataset.d);
    h.days=h.days.indexOf(d)>=0?h.days.filter(x=>x!==d):h.days.concat(d);
    save();rDays();
  };
  let armed=false;
  $('#h-del').onclick=()=>{
    if(!armed){armed=true;$('#h-del').textContent='Chạm lần nữa để xoá';return}
    state.habits=state.habits.filter(x=>x.id!==id);save();closeSheet();
  };
}

/* ---------- calendar ---------- */
let calY=null,calM=null,calSel=null;
function calInit(){if(calY===null){const n=new Date();calY=n.getFullYear();calM=n.getMonth();calSel=dKey(n)}}
function calFix(){const n=new Date();calSel=(calY===n.getFullYear()&&calM===n.getMonth())?dKey(n):calY+'-'+pad(calM+1)+'-01'}
function projTasks(key){
  const out=[],wd=new Date(key+'T00:00:00').getDay();
  state.tasks.forEach(t=>{
    if(!t.when)return;
    const tk=dKey(new Date(t.when));
    if(tk===key){out.push({t:t,time:hm(new Date(t.when)),proj:false});return}
    if(t.repeat!=='none'&&!t.done&&key>tk){
      if(t.repeat==='daily'||(t.repeat==='weekly'&&new Date(tk+'T00:00:00').getDay()===wd))out.push({t:t,time:hm(new Date(t.when)),proj:true});
    }
  });
  return out.sort((a,b)=>a.time<b.time?-1:1);
}
function habitsOn(key){
  const today=dKey(new Date()),wd=new Date(key+'T00:00:00').getDay();
  return state.habits.filter(h=>{
    if(key<today)return (h.log[key]||0)>0;
    return h.once?h.date===key:h.days.indexOf(wd)>=0;
  });
}
function fullDay(key){
  const d=new Date(key+'T00:00:00');
  return WD[d.getDay()]+', ngày '+d.getDate()+' tháng '+(d.getMonth()+1);
}
function renderCal(){
  if(tab!=='cal')return;
  const host=$('#view-cal'),ae=document.activeElement;
  if(ae&&host.contains(ae)&&/^(TEXTAREA|INPUT)$/.test(ae.tagName))return;
  calInit();
  if(CUI.isTimeline()){CUI.render(host);return}
  const now=new Date(),todayKey=dKey(now);
  const first=new Date(calY,calM,1),offset=(first.getDay()+6)%7,dim=new Date(calY,calM+1,0).getDate();
  let h=CUI.bar()+'<div class="calgrid"><div class="calleft"><div class="calnow" id="cal-now"></div>';
  h+='<div class="calh"><button type="button" data-act="calprev" aria-label="Tháng trước">‹</button><h2>Tháng '+(calM+1)+', '+calY+'</h2><button type="button" data-act="calnext" aria-label="Tháng sau">›</button><button type="button" class="todaybtn" data-act="caltoday">Hôm nay</button></div>';
  h+='<div class="wk">'+['T2','T3','T4','T5','T6','T7','CN'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="cgrid">';
  for(let i=0;i<offset;i++)h+='<span></span>';
  for(let d=1;d<=dim;d++){
    const k=calY+'-'+pad(calM+1)+'-'+pad(d);
    const nt=projTasks(k).length,nh=habitsOn(k).length>0,nn=!!(state.dayNotes[k]&&state.dayNotes[k].trim());
    h+='<button type="button" class="cd'+(k===todayKey?' today':'')+(k===calSel?' sel':'')+'" data-day="'+k+'" aria-label="Ngày '+d+'"><b>'+d+'</b><span class="dots">'+(nt?'<i class="d1"></i>':'')+(nh?'<i class="d2"></i>':'')+(nn?'<i class="d3"></i>':'')+'</span></button>';
  }
  h+='</div><div class="legend"><span><i class="d1"></i>Việc</span><span><i class="d2"></i>Thói quen</span><span><i class="d3"></i>Ghi chú</span></div></div><div class="calright">';
  const sel=calSel,isToday=sel===todayKey,isPast=sel<todayKey;
  const hts=x=>(isToday?hTimes(x):x.times).slice().sort();
  const entries=projTasks(sel).map(it=>({time:it.time,kind:'t',it:it}));
  const multi=[];
  habitsOn(sel).forEach(x=>{
    const ts=hts(x);
    if(ts.length===1)entries.push({time:ts[0],kind:'h',x:x,ts:ts});
    else multi.push({x:x,ts:ts});
  });
  entries.sort((a,b)=>a.time<b.time?-1:a.time>b.time?1:0);
  h+='<div class="daypanel"><div class="dayhead"><h3>'+fullDay(sel)+(isToday?' (hôm nay)':'')+'</h3><button type="button" class="addt" data-act="caladd">+ Việc</button></div>';
  const nowStr=hm(now);let placed=!isToday;
  const nowLine='<div class="nowline"><span>Bây giờ '+nowStr+'</span></div>';
  if(!entries.length&&!multi.length){h+=(isToday?nowLine:'')+'<p class="dhint" style="margin:8px 0">Chưa có gì trong ngày này.</p>'}
  entries.forEach(en=>{
    if(!placed&&en.time>nowStr){h+=nowLine;placed=true}
    if(en.kind==='t'){
      const t=en.it.t,nt=t.note&&t.note.trim();
      h+='<button type="button" class="ag'+(t.done?' dn':'')+'" data-act="opentask" data-id="'+t.id+'"><span class="at">'+en.time+'</span><span class="ae">'+esc(t.emoji)+'</span><span class="an">'+esc(t.title)+(en.it.proj?' <em>(lặp lại)</em>':'')+(nt?'<span class="anote">📝 '+esc(nt.split('\n')[0].slice(0,60))+'</span>':'')+'</span></button>';
    }else{
      const x=en.x,dn=isToday?habitDone(x):(isPast?(x.log[sel]||0):0);
      const st=isPast?(dn?'Đã làm':'Chưa làm'):isToday?(dn?'Đã xong':'Chưa làm'):'Thói quen';
      const nt=x.note&&x.note.trim();
      h+='<div class="ag hb'+(isToday&&dn?' dn':'')+'" data-hid="'+x.id+'" style="cursor:pointer"><span class="at">'+en.time+'</span><span class="ae">'+esc(x.emoji)+'</span><span class="an">'+esc(x.title)+'<span class="anote">'+st+(nt?', 📝 '+esc(nt.split('\n')[0].slice(0,40)):'')+'</span></span></div>';
    }
  });
  if(!placed&&entries.length)h+=nowLine;
  if(multi.length){
    h+='<div class="shead2">Thói quen nhiều lần trong ngày</div>'+multi.map(m=>{
      const x=m.x,ts=m.ts,n=ts.length,dn=isToday?habitDone(x):(isPast?(x.log[sel]||0):0);
      const range=ts.length?ts[0]+' đến '+ts[n-1]:'';
      const sub=isPast?'Đã làm '+dn+' lần':(isToday?dn+' / '+n+' lần hôm nay, '+range:n+' lần, '+range);
      return '<div class="ag hb" data-hid="'+x.id+'" style="cursor:pointer"><span class="at">'+(ts[0]||'')+'</span><span class="ae">'+esc(x.emoji)+'</span><span class="an">'+esc(x.title)+'<span class="anote">'+sub+'</span></span></div>';
    }).join('');
  }
  h+='<div class="field" style="margin-top:14px"><label for="day-note">Ghi chú cho ngày này</label><textarea class="note" id="day-note" rows="3">'+esc(state.dayNotes[sel]||'')+'</textarea></div></div></div></div>';
  host.innerHTML=h;
  tickClock();
}

function calAdd(key,time,dur){openManual('reminder',key,time,dur);fromCal=true}
function openManual(kind,date,time,dur){
  if(kind==='habit'){
    openSheet(normalize({intent:'habit',title:'',emoji:'🎯',habit:{recurring:true,times:['07:00'],days:[0,1,2,3,4,5,6]}},''),'manual');
  }else{
    const when=date?((date===dKey(new Date())&&!time)?toLocal(defaultWhen()):date+'T'+(time||'09:00')):toLocal(defaultWhen());
    const p=normalize({intent:'task',title:'',emoji:kind==='event'?'📅':'⏰',when:when,leadMinutes:kind==='event'?30:0,repeat:'none'},'');
    if(dur)p.durMin=dur;
    openSheet(p,'manual');
  }
}

const CUI=window.RemiCalUI({
  state:state,store:store,esc:esc,dKey:dKey,WDS:WDS,uid:uid,toLocal:toLocal,splitTitle:splitTitle,
  projTasks:k=>projTasks(k),habitsOn:k=>habitsOn(k),
  habitTimes:(h,k)=>(k===dKey(new Date())?hTimes(h):h.times).slice().sort(),
  fullDay:k=>fullDay(k),profileWake:()=>profileWake(),profileBed:()=>profileBed(),
  getSel:()=>calSel,
  setSel:k=>{calSel=k;const d=new Date(k+'T00:00:00');calY=d.getFullYear();calM=d.getMonth()},
  addAt:(k,t,d)=>calAdd(k,t,d),openTask:id=>openTask(id),
  save:()=>save(),render:()=>render(),tick:()=>tick(),
  alertUser:(a,b,c,d)=>alertUser(a,b,c,d),
  sheet:()=>$('#sheet'),closeSheet:()=>closeSheet()
});
/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const ex=e.target.closest('[data-ex]');
  if(ex){submit(ex.dataset.ex);return}
  const nw=e.target.closest('[data-new]');
  if(nw){openManual(nw.dataset.new);return}
  const card=e.target.closest('.task[data-id]');
  if(card&&!e.target.closest('.check')&&!e.target.closest('input,button,a,label')){openTask(card.dataset.id);return}
  const hc=e.target.closest('[data-hid]');
  if(hc&&!e.target.closest('button,input,a,label')){openHabit(hc.dataset.hid);return}
  const dd=e.target.closest('[data-day]');
  if(dd){calSel=dd.dataset.day;render();return}
  if(e.target.closest('#me')){openProfile();return}
  const tb=e.target.closest('nav.tabs button');
  if(tb){tab=tb.dataset.tab;render();window.scrollTo({top:0});return}
  const el=e.target.closest('[data-act]');if(!el)return;
  const act=el.dataset.act,id=el.dataset.id;
  if(act==='toggle'){openIds.has(id)?openIds.delete(id):openIds.add(id);render()}
  else if(act==='done'){completeTask(id)}
  else if(act==='tdel'){state.tasks=state.tasks.filter(t=>t.id!==id);save();render()}
  else if(act==='hadd'){addHabit(id,Number(el.dataset.n))}
  else if(act==='addit'){addItem(id)}
  else if(act==='opentask'){openTask(id)}
  else if(act==='calprev'){calM--;if(calM<0){calM=11;calY--}calFix();render()}
  else if(act==='calnext'){calM++;if(calM>11){calM=0;calY++}calFix();render()}
  else if(act==='caltoday'){const n=new Date();calY=n.getFullYear();calM=n.getMonth();calSel=dKey(n);render()}
  else if(act==='caladd'){openManual('reminder',calSel);fromCal=true}
  else if(act==='hdel'){state.habits=state.habits.filter(h=>h.id!==id);save();render()}
  else if(act==='newhabit'){openManual('habit')}
    else if(act==='strange'){statRange=Number(el.dataset.n);render()}
  else if(act==='notif'){enablePush()}
  else if(act.indexOf('cx-')===0){CUI.act(act,el)}
});
document.addEventListener('change',e=>{
  const el=e.target.closest('[data-act="cl"]');if(!el)return;
  const t=state.tasks.find(x=>x.id===el.dataset.id);if(!t)return;
  t.checklist[Number(el.dataset.i)].done=el.checked;save();
  const card=el.closest('.task');const chip=card&&card.querySelector('.chip.ai');
  if(chip){const left=t.checklist.filter(c=>!c.done).length;chip.textContent='✨ '+(left?left+' mục cần chuẩn bị':'Đã chuẩn bị xong')}
});
$('#send').addEventListener('click',submit);
$('#ta').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}});
$('#scrim').addEventListener('click',closeSheet);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.matches&&e.target.matches('input[data-in]')){e.preventDefault();addItem(e.target.dataset.in)}});

document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target&&e.target.classList&&e.target.classList.contains('task')){openTask(e.target.dataset.id)}
});
document.addEventListener('input',e=>{
  if(e.target&&e.target.id==='day-note'){
    const v=e.target.value;
    if(v.trim())state.dayNotes[calSel]=v;else delete state.dayNotes[calSel];
    save();
  }
});
document.addEventListener('focusout',e=>{if(e.target&&e.target.id==='day-note')setTimeout(render,0)});

document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target&&e.target.classList&&e.target.classList.contains('hcard')&&e.target.dataset.hid)openHabit(e.target.dataset.hid);
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.body.classList.contains('sheet-open')){closeSheet();return}
  const tg=e.target&&e.target.tagName;
  if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(tg||'')&&document.getElementById('welcome').hidden&&!document.body.classList.contains('sheet-open')){
    e.preventDefault();
    if(tab!=='today'){tab='today';render()}
    $('#ta').focus();
  }
});

/* voice */
(function(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const mic=$('#mic');
  if(!SR){mic.style.display='none';return}
  let rec=null,on=false;
  mic.addEventListener('click',()=>{
    if(on&&rec){try{rec.stop()}catch(e){}return}
    try{
      rec=new SR();rec.lang='vi-VN';rec.interimResults=true;rec.continuous=false;
      rec.onresult=ev=>{let t='';for(let i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;$('#ta').value=t};
      rec.onend=()=>{on=false;mic.classList.remove('rec');if($('#ta').value.trim())submit()};
      rec.onerror=()=>{on=false;mic.classList.remove('rec');alertUser('🎙️','Không dùng được micro','Hãy cho phép micro hoặc gõ trực tiếp.')};
      rec.start();on=true;mic.classList.add('rec');
    }catch(e){on=false;mic.classList.remove('rec')}
  });
})();

function openProfile(){
  const p=state.profile||{name:'',tone:'casual'};let tone=p.tone||'casual';
  const sh=$('#sheet');draft=null;
  sh.innerHTML='<div class="grab"></div>'+
    '<div class="field" style="margin-top:0"><label for="p-name">Tên gọi</label><input class="title-in" id="p-name" maxlength="20" value="'+esc(p.name)+'"></div>'+
    '<div class="field"><label>Giọng nhắc</label><div class="tones">'+Object.keys(TONES).map(k=>'<button type="button" class="tone'+(k===tone?' on':'')+'" data-tone="'+k+'">'+TONES[k]+'</button>').join('')+'</div></div>'+
    '<div class="two"><div class="field"><label for="p-wake">Thường dậy lúc</label><input type="time" id="p-wake" value="'+esc(profileWake())+'"></div><div class="field"><label for="p-bed">Thường ngủ lúc</label><input type="time" id="p-bed" value="'+esc(profileBed())+'"></div></div>'+
    (me?'<p class="dhint" style="margin:14px 0 0">Tài khoản: '+esc(me.email)+'</p>':'')+
    '<div class="prev" id="p-prev"></div>'+
    '<div class="sbtns"><button class="sec" id="p-out" type="button">Đăng xuất</button><button class="pri" id="p-ok" type="button">Lưu</button></div>';
  const upd=()=>{$('#p-prev').textContent='🔔 '+phrase('due','Uống nước',null,$('#p-name').value.trim(),tone)};
  upd();
  $('#p-name').addEventListener('input',upd);
  sh.querySelectorAll('.tone').forEach(b=>b.onclick=()=>{tone=b.dataset.tone;sh.querySelectorAll('.tone').forEach(x=>x.classList.toggle('on',x===b));upd()});
  $('#p-ok').onclick=()=>{const v=$('#p-name').value.trim();if(!v){$('#p-name').focus();return}state.profile={name:v,tone:tone,wake:$('#p-wake').value||'06:30',bed:$('#p-bed').value||'22:30'};state.habits.forEach(h=>{if(h.spread)h.plan=null});save();closeSheet();tick();render()};
  $('#p-out').onclick=()=>{closeSheet();logout()};
  document.body.classList.add('sheet-open');
}

/* ---------- đồng bộ với máy chủ ---------- */
const API=window.RemiAPI;
let me=store.get('remi.me',null);
const sigOf=o=>JSON.stringify(Object.assign({},o,{u:0}));

/** Gộp hai bản dữ liệu (máy này và máy chủ): từng mục theo dấu thời gian `u`, xoá được ghi bằng "bia mộ". */
function mergeSnapshots(L,R){
  L=L||{};R=R||{};
  const out={v:1};
  const lm=L.meta||{},rm=R.meta||{};
  const deleted={},cutoff=Date.now()-60*24*3600*1000;
  [lm.deleted||{},rm.deleted||{}].forEach(d=>Object.keys(d).forEach(id=>{deleted[id]=Math.max(deleted[id]||0,d[id])}));
  Object.keys(deleted).forEach(id=>{if(deleted[id]<cutoff)delete deleted[id]});
  const list=(a,b)=>{
    const m={};
    (a||[]).forEach(x=>{m[x.id]=x});
    (b||[]).forEach(x=>{const y=m[x.id];if(!y||(x.u||0)>(y.u||0))m[x.id]=x});
    return Object.keys(m).map(k=>m[k]).filter(x=>!(deleted[x.id]&&deleted[x.id]>=(x.u||0)));
  };
  out.tasks=list(L.tasks,R.tasks);
  out.habits=list(L.habits,R.habits);
  const mapMerge=(a,b,ua,ub)=>{
    a=a||{};b=b||{};ua=ua||{};ub=ub||{};
    const res={},u={};
    new Set(Object.keys(a).concat(Object.keys(b),Object.keys(ua),Object.keys(ub))).forEach(k=>{
      const tl=ua[k]||0,tr=ub[k]||0;
      const fromR=tr>tl||(tr===tl&&!(k in a)&&(k in b));
      res[k]=fromR?b[k]:a[k];u[k]=Math.max(tl,tr);
    });
    return {res:res,u:u};
  };
  const dn=mapMerge(L.dayNotes,R.dayNotes,lm.dnU,rm.dnU);
  const dish=mapMerge(L.dishes,R.dishes,lm.dishU,rm.dishU);
  out.dayNotes=dn.res;out.dishes=dish.res;
  const kit=window.RemiKitchen.mergeKitchen(L.kitchen,R.kitchen,lm.mealU,rm.mealU,deleted);
  out.kitchen=kit.kitchen;
  out.badges=window.RemiStats.mergeBadges(L.badges,R.badges);
  const pantry={};
  [L.pantry||{},R.pantry||{}].forEach(p=>Object.keys(p).forEach(k=>{
    const e=p[k];if(!pantry[k]||(e.n||0)>(pantry[k].n||0))pantry[k]=e;
  }));
  out.pantry=pantry;
  const pickU=(a,ua,b,ub)=>((ub||0)>(ua||0)?b:a);
  out.profile=pickU(L.profile,lm.profileU,R.profile,rm.profileU);
  out.sleep=pickU(L.sleep,lm.sleepU,R.sleep,rm.sleepU);
  out.greeted=(L.greeted||'')>(R.greeted||'')?L.greeted:(R.greeted||'');
  out.meta={dnU:dn.u,dishU:dish.u,mealU:kit.mealU,profileU:Math.max(lm.profileU||0,rm.profileU||0),sleepU:Math.max(lm.sleepU||0,rm.sleepU||0),deleted:deleted};
  return out;
}

const Sync={
  base:store.get('remi.base',0),
  dirty:store.get('remi.dirty',false),
  sig:{t:{},h:{},dn:{},dish:{},st:{},rc:{},meal:{},profile:'',sleep:''},
  timer:null,busy:false,started:false,lastFull:0,
  /** Ghi lại "chữ ký" hiện tại để không đóng dấu lại dữ liệu đã có. */
  init(){
    this.sig.t={};state.tasks.forEach(t=>{this.sig.t[t.id]=sigOf(t)});
    this.sig.h={};state.habits.forEach(h=>{this.sig.h[h.id]=sigOf(h)});
    this.sig.dn=Object.assign({},state.dayNotes);
    this.sig.dish={};Object.keys(state.dishes).forEach(k=>{this.sig.dish[k]=JSON.stringify(state.dishes[k])});
    this.sig.st={};state.kitchen.stock.forEach(x=>{this.sig.st[x.id]=sigOf(x)});
    this.sig.rc={};state.kitchen.recipes.forEach(x=>{this.sig.rc[x.id]=sigOf(x)});
    this.sig.meal={};Object.keys(state.kitchen.meals).forEach(k=>{this.sig.meal[k]=JSON.stringify(state.kitchen.meals[k])});
    this.sig.profile=JSON.stringify(state.profile);
    this.sig.sleep=JSON.stringify(state.sleep);
    this.sig.bd=JSON.stringify(state.badges);
  },
  /** So với lần trước, mục nào đổi thì đóng dấu thời gian; mục nào mất thì ghi bia mộ. */
  stamp(){
    const now=Date.now(),m=state.meta;let changed=false;
    const items=(arr,sg)=>{
      const ids={};
      arr.forEach(x=>{ids[x.id]=1;const s=sigOf(x);if(sg[x.id]!==s){x.u=now;sg[x.id]=s;changed=true}});
      Object.keys(sg).forEach(id=>{if(!ids[id]){delete sg[id];m.deleted[id]=now;changed=true}});
    };
    items(state.tasks,this.sig.t);items(state.habits,this.sig.h);
    items(state.kitchen.stock,this.sig.st);items(state.kitchen.recipes,this.sig.rc);
    new Set(Object.keys(state.kitchen.meals).concat(Object.keys(this.sig.meal))).forEach(k=>{
      const cur=state.kitchen.meals[k]===undefined?undefined:JSON.stringify(state.kitchen.meals[k]);
      if(cur!==this.sig.meal[k]){m.mealU[k]=now;changed=true;if(cur===undefined)delete this.sig.meal[k];else this.sig.meal[k]=cur}
    });
    new Set(Object.keys(state.dayNotes).concat(Object.keys(this.sig.dn))).forEach(k=>{
      if(state.dayNotes[k]!==this.sig.dn[k]){
        m.dnU[k]=now;changed=true;
        if(state.dayNotes[k]===undefined)delete this.sig.dn[k];else this.sig.dn[k]=state.dayNotes[k];
      }
    });
    new Set(Object.keys(state.dishes).concat(Object.keys(this.sig.dish))).forEach(k=>{
      const cur=state.dishes[k]===undefined?undefined:JSON.stringify(state.dishes[k]);
      if(cur!==this.sig.dish[k]){
        m.dishU[k]=now;changed=true;
        if(cur===undefined)delete this.sig.dish[k];else this.sig.dish[k]=cur;
      }
    });
    const p=JSON.stringify(state.profile);if(p!==this.sig.profile){m.profileU=now;this.sig.profile=p;changed=true}
    const sl=JSON.stringify(state.sleep);if(sl!==this.sig.sleep){m.sleepU=now;this.sig.sleep=sl;changed=true}
    const bd=JSON.stringify(state.badges);if(bd!==this.sig.bd){this.sig.bd=bd;changed=true}
    if(changed){this.dirty=true;store.set('remi.dirty',true)}
  },
  snapshot(){
    const m=state.meta,dn=Object.assign({},state.dayNotes),dish=Object.assign({},state.dishes);
    Object.keys(m.dnU).forEach(k=>{if(dn[k]===undefined)dn[k]=''});
    Object.keys(m.dishU).forEach(k=>{if(dish[k]===undefined)dish[k]=null});
    return {v:1,tasks:state.tasks,habits:state.habits,dayNotes:dn,pantry:state.pantry,dishes:dish,profile:state.profile,sleep:state.sleep,   greeted:state.greeted,kitchen:state.kitchen,badges:state.badges,
      meta:{dnU:m.dnU,dishU:m.dishU,mealU:m.mealU,profileU:m.profileU,sleepU:m.sleepU,deleted:m.deleted}};
  },
  apply(s){
    state.tasks=s.tasks||[];state.habits=s.habits||[];
    state.dayNotes={};Object.keys(s.dayNotes||{}).forEach(k=>{if(s.dayNotes[k])state.dayNotes[k]=s.dayNotes[k]});
    state.dishes={};Object.keys(s.dishes||{}).forEach(k=>{if(s.dishes[k])state.dishes[k]=s.dishes[k]});
    state.pantry=s.pantry||{};
    state.profile=s.profile||null;
    if(s.sleep)state.sleep=s.sleep;
    state.greeted=s.greeted||'';
    state.badges=window.RemiStats.normBadges(s.badges);
    state.kitchen=window.RemiKitchen.normalizeKitchen(s.kitchen);
    state.meta=Object.assign({dnU:{},dishU:{},mealU:{},deleted:{},profileU:0,sleepU:0},s.meta||{});
    state.habits.forEach(h=>{if(!h.log)h.log={};if(!Array.isArray(h.days)||!h.days.length)h.days=[0,1,2,3,4,5,6];if(!Array.isArray(h.times)||!h.times.length)h.times=['07:00']});
    this.init();persist();
  },
  async pull(){
    const r=await API.get('/api/state');
    if(!r.state)return;
    if(r.version<=this.base&&!this.dirty)return;
    const merged=mergeSnapshots(this.snapshot(),r.state);
    this.apply(merged);
    this.base=r.version;store.set('remi.base',this.base);
    if(JSON.stringify(merged)!==JSON.stringify(r.state)){this.dirty=true;store.set('remi.dirty',true)}
    render();
  },
  async push(retries){
    if(!me||this.busy)return;
    this.busy=true;
    try{
      const r=await API.put('/api/state',{baseVersion:this.base,state:this.snapshot(),schedule:buildSchedule()});
      this.base=r.version;store.set('remi.base',this.base);
      this.dirty=false;store.set('remi.dirty',false);this.lastFull=Date.now();
    }catch(e){
      if(e.status===409&&e.data&&(retries===undefined||retries>0)){
        this.apply(mergeSnapshots(this.snapshot(),e.data.state||{}));
        this.base=e.data.version;store.set('remi.base',this.base);
        this.busy=false;render();
        return this.push((retries===undefined?3:retries)-1);
      }
      if(e.status===401)logoutLocal();
    }finally{this.busy=false}
  },
  afterSave(){
    if(!this.dirty||!me)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.push(),1500);
  },
  start(){
    if(this.started)return;this.started=true;
    const full=async()=>{try{await this.pull()}catch(e){}await this.push()};
    full();
    setInterval(()=>{
      if(document.hidden||!me)return;
      if(Date.now()-this.lastFull>20*60000)full();
      else this.pull().catch(()=>{});
    },60000);
    window.addEventListener('online',()=>full());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-this.lastFull>5*60000)full()});
  }
};

/** Lịch nhắc 48 giờ tới, gửi kèm dữ liệu để máy chủ đẩy thông báo kể cả khi app đã đóng. */
function spreadTimes(sp,startMin){
  if(/^\d{2}:\d{2}$/.test(sp.from)&&/^\d{2}:\d{2}$/.test(sp.to))return windowTimes(Math.max(1,sp.count),toMin(sp.from),toMin(sp.to));
  const end=Math.min(1435,sp.to==='bed'?toMin(profileBed()):toMin(sp.to));
  if(end<=startMin+20)return [fromMin(Math.min(1435,startMin+5))];
  const n=Math.max(1,sp.count),step=(end-startMin)/n,out=[];
  for(let i=0;i<n;i++){const t=fromMin(Math.min(1435,Math.round((startMin+(i+0.5)*step)/5)*5));if(out.indexOf(t)<0)out.push(t)}
  return out;
}
function buildSchedule(){
  const now=Date.now(),end=now+48*3600000,out=[];
  const add=(key,at,title,body,cond)=>{if(at>now&&at<end&&out.length<450)out.push({key:key,at:Math.round(at),title:title,body:body||'',cond:cond||''})};
  state.tasks.forEach(t=>{
    if(t.done||!t.when)return;
    let d=new Date(t.when);
    for(let i=0;i<60&&d.getTime()<end;i++){
      const iso=d.toISOString(),n=(t.checklist||[]).length;
      if(t.leadMin>0)add('t:'+t.id+':'+iso+':lead',d.getTime()-t.leadMin*60000,t.emoji+' '+phrase('lead',t.title,leadText(t.leadMin)),n?n+' mục cần chuẩn bị':'Lúc '+hm(d));
      add('t:'+t.id+':'+iso+':due',d.getTime(),t.emoji+' '+phrase('due',t.title),'Lúc '+hm(d));
      if(t.repeat==='none')break;
      d=new Date(d);d.setDate(d.getDate()+(t.repeat==='weekly'?7:1));
    }
  });
  state.habits.forEach(h=>{
    for(let off=0;off<=2;off++){
      const day=new Date();day.setHours(0,0,0,0);day.setDate(day.getDate()+off);
      if(!habitActive(h,day))continue;
      let ts=(off===0?hTimes(h):(h.spread?spreadTimes(h.spread,toMin(profileWake())):h.times)).slice().sort();
      const done=off===0?habitDone(h):0,goal=ts.length;
      ts=ts.slice(done);
      ts.forEach(tm=>{
        const p=tm.split(':').map(Number),at=new Date(day);at.setHours(p[0],p[1],0,0);
        add('h:'+h.id+':'+dKey(day)+':'+tm,at.getTime(),h.emoji+' '+phrase('due',h.title),h.portionMl?'Uống '+h.portionMl+' ml':((off===0&&goal>1)?'Hôm nay '+done+'/'+goal+' lần':'Lúc '+tm));
      });
    }
  });
  window.RemiKitchen.expiryReminders(state.kitchen.stock,now).forEach(r=>add(r.key,r.at,r.title,r.body));   // nhóm B: đồ sắp hết hạn
  if(!state.sleep.awake){
    const wp=wakePlan();
    if(wp){
      const k='w:'+wp.task.id+':'+wp.task.when;
      add(k+':wake',wp.call.getTime(),'⏰ '+phrase('wake',wp.title,leadText(WAKE_BUF)),'Lúc '+wp.timeStr+' bạn có việc.','asleep');
      add(k+':wake2',wp.due.getTime()-10*60000,'⏰ '+phrase('wake2',wp.title,'10 phút'),'Bạn vẫn đang ở chế độ ngủ.','asleep');
    }
  }
  return out;
}

/* ---------- tài khoản ---------- */
const LOGO_SVG=`<svg viewBox="0 0 1024 1024" width="120" height="120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Remi, chú đồng hồ báo thức đang cười" style="display:block;"><rect width="1024" height="1024" rx="232" fill="#FF6A1F"/><line x1="220" y1="243" x2="180" y2="236" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/><line x1="244" y1="190" x2="214" y2="164" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/><line x1="292" y1="157" x2="278" y2="119" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/><line x1="804" y1="243" x2="844" y2="236" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/><line x1="780" y1="190" x2="810" y2="164" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/><line x1="732" y1="157" x2="746" y2="119" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/><circle cx="330" cy="262" r="84" fill="#FFD23F"/><circle cx="694" cy="262" r="84" fill="#FFD23F"/><ellipse cx="304" cy="234" rx="24" ry="14" fill="#fff" opacity=".6" transform="rotate(-35 304 234)"/><ellipse cx="668" cy="234" rx="24" ry="14" fill="#fff" opacity=".6" transform="rotate(-35 668 234)"/><ellipse cx="512" cy="908" rx="236" ry="22" fill="#4A1D4F" opacity=".16"/><ellipse cx="400" cy="862" rx="62" ry="40" fill="#4A1D4F"/><ellipse cx="624" cy="862" rx="62" ry="40" fill="#4A1D4F"/><circle cx="512" cy="548" r="306" fill="#fff"/><circle cx="512" cy="548" r="270" fill="#FFF3E8"/><circle cx="512" cy="316" r="15" fill="#4A1D4F" opacity="1"/><circle cx="628" cy="347" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="713" cy="432" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="744" cy="548" r="15" fill="#4A1D4F" opacity="1"/><circle cx="713" cy="664" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="628" cy="749" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="512" cy="780" r="15" fill="#4A1D4F" opacity="1"/><circle cx="396" cy="749" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="311" cy="664" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="280" cy="548" r="15" fill="#4A1D4F" opacity="1"/><circle cx="311" cy="432" r="9" fill="#4A1D4F" opacity="0.35"/><circle cx="396" cy="347" r="9" fill="#4A1D4F" opacity="0.35"/><path d="M512 252L430 204L430 300Z M512 252L594 204L594 300Z" fill="#FF5C93"/><circle cx="512" cy="252" r="28" fill="#FF5C93"/><circle cx="512" cy="252" r="12" fill="#fff" opacity=".55"/><ellipse cx="430" cy="520" rx="36" ry="48" fill="#4A1D4F"/><ellipse cx="594" cy="520" rx="36" ry="48" fill="#4A1D4F"/><circle cx="443" cy="500" r="14" fill="#fff"/><circle cx="607" cy="500" r="14" fill="#fff"/><circle cx="420" cy="540" r="6" fill="#fff"/><circle cx="584" cy="540" r="6" fill="#fff"/><ellipse cx="350" cy="602" rx="48" ry="30" fill="#FF8FB1" opacity=".85"/><ellipse cx="674" cy="602" rx="48" ry="30" fill="#FF8FB1" opacity=".85"/><path d="M458 600Q512 704 566 600Z" fill="#4A1D4F" stroke="#4A1D4F" stroke-width="12" stroke-linejoin="round"/><ellipse cx="512" cy="652" rx="26" ry="15" fill="#FF7FA3"/><path d="M905 566 Q914.72 610.28 959 620 Q914.72 629.72 905 674 Q895.28 629.72 851 620 Q895.28 610.28 905 566Z" fill="#FFD23F"/><path d="M858 686 Q862.68 707.32 884 712 Q862.68 716.68 858 738 Q853.32 716.68 832 712 Q853.32 707.32 858 686Z" fill="#fff"/><path d="M128 428 Q135.56 462.44 170 470 Q135.56 477.56 128 512 Q120.44 477.56 86 470 Q120.44 462.44 128 428Z" fill="#fff"/><path d="M176 360 Q179.6 376.4 196 380 Q179.6 383.6 176 400 Q172.4 383.6 156 380 Q172.4 376.4 176 360Z" fill="#FFD23F"/></svg>`;
function wipeLocal(){
  try{Object.keys(localStorage).filter(k=>k.indexOf('remi.')===0).forEach(k=>localStorage.removeItem(k))}catch(e){}
}
function logoutLocal(){wipeLocal();location.reload()}
async function logout(){
  try{
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.getRegistration();
      const sub=reg&&await reg.pushManager.getSubscription();
      if(sub){await API.del('/api/push/subscribe',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe()}
    }
    await API.post('/api/auth/logout',{});
  }catch(e){}
  logoutLocal();
}
function showLoading(){
  const w=$('#welcome');w.hidden=false;
  w.innerHTML='<div class="wbox"><div class="wicon">'+LOGO_SVG+'</div><p>Đang tải…</p></div>';
}
function showAuth(mode){
  const reg=mode==='register',w=$('#welcome');w.hidden=false;
  w.innerHTML='<div class="wbox"><div class="wicon">'+LOGO_SVG+'</div><h1>'+(reg?'Tạo tài khoản Remi':'Chào mừng trở lại')+'</h1>'+
    '<p>'+(reg?'Remi cần vài thông tin để nhớ giúp bạn.':'Đăng nhập để tiếp tục.')+'</p>'+
    '<form id="auth-form" novalidate>'+
    (reg?'<label class="wl" for="a-name">Remi nên gọi bạn là gì?</label><input id="a-name" maxlength="20" autocomplete="nickname">':'')+
    '<label class="wl" for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" inputmode="email">'+
    '<label class="wl" for="a-pw">Mật khẩu</label><input id="a-pw" type="password" autocomplete="'+(reg?'new-password':'current-password')+'">'+
    '<p class="werr" id="a-err" role="alert"></p>'+
    '<button class="pri2" id="a-go" type="submit">'+(reg?'Tạo tài khoản':'Đăng nhập')+'</button></form>'+
    '<button class="wlink" id="a-sw" type="button">'+(reg?'Đã có tài khoản? Đăng nhập':'Chưa có tài khoản? Tạo mới')+'</button></div>';
  $('#a-sw').onclick=()=>showAuth(reg?'login':'register');
  $('#auth-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const err=$('#a-err'),email=$('#a-email').value.trim(),pw=$('#a-pw').value,name=reg?$('#a-name').value.trim():'';
    err.textContent='';
    if(reg&&!name){err.textContent='Hãy nhập tên gọi.';return}
    if(!/^\S+@\S+\.\S+$/.test(email)){err.textContent='Email chưa đúng.';return}
    if(pw.length<8){err.textContent='Mật khẩu cần ít nhất 8 ký tự.';return}
    $('#a-go').disabled=true;
    try{
      const r=await API.post(reg?'/api/auth/register':'/api/auth/login',{email:email,password:pw,name:name});
      await onLoggedIn(r.user);
    }catch(ex){err.textContent=ex.message||'Có lỗi, thử lại nhé.';$('#a-go').disabled=false}
  });
  const tok=(showAuth.n=(showAuth.n||0)+1);
  setTimeout(()=>{
    if(showAuth.n!==tok)return;                                   // form này đã bị thay bằng form khác
    const a=document.activeElement;
    if(a&&a!==document.body&&w.contains(a))return;                // người dùng đã tự chọn một ô, đừng giành con trỏ
    const f=$(reg?'#a-name':'#a-email');if(f)f.focus();
  },150);
}
async function onLoggedIn(user){
  const prev=store.get('remi.me',null);
  if(prev&&prev.id!==user.id){wipeLocal();store.set('remi.me',user);location.reload();return}
  me=user;store.set('remi.me',user);
  Sync.init();
  try{await Sync.pull()}catch(e){}
  if(!state.profile)state.profile={name:user.name,tone:'casual'};
  $('#welcome').hidden=true;
  save();render();tick();
  Sync.start();
  const first=!state.tasks.length&&!state.habits.length;
  if(first)alertUser('👋','Chào '+(nm()||'bạn')+', mình là Remi!','Thử tạo một nhắc hẹn đầu tiên nhé.');
}

/* ---------- thông báo đẩy ---------- */
function b64ToBytes(b64){
  const pad='='.repeat((4-b64.length%4)%4),raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function enablePush(){
  try{
    if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Trình duyệt này chưa hỗ trợ thông báo đẩy. Trên iPhone, hãy thêm Remi vào Màn hình chính trước.');
    const perm=await Notification.requestPermission();
    if(perm!=='granted')throw new Error('Bạn chưa cho phép thông báo.');
    const reg=await navigator.serviceWorker.ready;
    const k=await API.get('/api/push/key');
    if(!k.enabled)throw new Error('Máy chủ chưa bật thông báo đẩy.');
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(k.publicKey)});
    await API.post('/api/push/subscribe',{subscription:sub.toJSON()});
    store.set('remi.push',true);
    toast('Đã bật thông báo nền');
    Sync.push();render();
  }catch(e){alertUser('🔕','Chưa bật được thông báo',e.message||'Thử lại sau nhé.')}
}
function registerSW(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
  navigator.serviceWorker.addEventListener('message',e=>{
    if(e.data&&e.data.type==='push')alertUser('🔔',e.data.title||'Remi',e.data.body||'');
  });
}

/* start */
Sync.init();
registerSW();
render();tick();
setInterval(tick,15000);
tickClock();setInterval(tickClock,1000);
setInterval(render,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();render()}});
if(me){
  Sync.start();
  API.get('/api/me').then(r=>{me=r.user;store.set('remi.me',me)}).catch(e=>{if(e.status===401)logoutLocal()});
}else{
  showLoading();
  API.get('/api/me').then(r=>onLoggedIn(r.user)).catch(()=>showAuth('login'));
}
})();
