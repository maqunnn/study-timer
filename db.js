import{METHODS,SKILL_CODES,start,setPaused,resume,toggleFocus,finish}from'./core.js';
let opening;
function migrateSession(row){
  if(row.learning_method)return{...row,pending:!!row.pending};
  const oldSkill=String(row.skill||'').toLowerCase(),skill=SKILL_CODES.includes(oldSkill)?[oldSkill]:[];
  const{skill:legacySkill,...rest}=row;
  const start=Date.parse(row.start_at),end=Date.parse(row.end_at),pause=Math.max(0,Number(row.pause_seconds)||0),pauseAt=Math.max(start,end-pause*1000);
  const events=[{type:'start',at:start},...(pause>0?[{type:'pause',at:pauseAt},{type:'resume',at:pauseAt}]:[]),{type:'end',at:end}];
  return{...rest,learning_method:'other',skills:JSON.stringify(skill),focus_mode:'off',focus_seconds:0,events:JSON.stringify(events),pending:!!row.pending};
}
function migrateCurrent(s){
  if(!s||s.startedAt!==undefined)return s;
  const skill=SKILL_CODES.includes(s.skill)?[s.skill]:[];
  return{id:s.id,method:'other',timezone:s.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone,startedAt:s.started,state:s.mode==='paused'?'paused':'active',stateChangedAt:s.changed,activeMs:s.activeMs||0,focusOn:false,focusChangedAt:null,focusMs:0,events:[{type:'start',at:s.started}]};
}
export function db(){return opening||=new Promise((resolve,reject)=>{
  const r=indexedDB.open('four-study-v1',2);
  r.onupgradeneeded=(event)=>{
    const x=r.result,tx=r.transaction;
    if(!x.objectStoreNames.contains('state'))x.createObjectStore('state');
    let store;if(!x.objectStoreNames.contains('sessions'))store=x.createObjectStore('sessions',{keyPath:'session_id'});else store=tx.objectStore('sessions');
    if(event.oldVersion<2){const rows=store.openCursor();rows.onsuccess=()=>{const c=rows.result;if(c){c.update(migrateSession(c.value));c.continue();}};const current=tx.objectStore('state').get('current');current.onsuccess=()=>{if(current.result)tx.objectStore('state').put(migrateCurrent(current.result),'current');};}
  };
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=null;reject(r.error);};r.onblocked=()=>reject(Error('ほかのタイマー画面を閉じて再度お試しください。'));
});}
export async function readAll(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(['state','sessions']);const current=tx.objectStore('state').get('current'),draft=tx.objectStore('state').get('draft'),rows=tx.objectStore('sessions').getAll(),config=tx.objectStore('state').get('config');tx.oncomplete=()=>resolve({current:current.result||null,draft:draft.result||null,rows:rows.result||[],config:config.result||{endpoint:'',token:''}});tx.onerror=()=>reject(tx.error);});}
// IndexedDB serializes read/write transactions across tabs; IDs and states prevent stale taps.
export async function change(action,method,expectedId,expectedState){
 const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(['state','sessions'],'readwrite'),state=tx.objectStore('state');let failure;
  const current=state.get('current'),draft=state.get('draft');current.onsuccess=()=>draft.onsuccess=()=>{try{
   const s=current.result,waiting=draft.result,now=Date.now();
   if(action==='start'){if(s||waiting)return;if(!METHODS.includes(method))throw Error('学習方法を選び直してください。');state.put(start(method,now,Intl.DateTimeFormat().resolvedOptions().timeZone,crypto.randomUUID()),'current');}
   else if(action==='pause'){if(!s||s.id!==expectedId||s.state!=='active')return;state.put(setPaused(s,now),'current');}
   else if(action==='resume'){if(!s||s.id!==expectedId||s.state!=='paused')return;state.put(resume(s,now),'current');}
   else if(action==='focus'){if(!s||s.id!==expectedId||s.state!=='active')return;state.put(toggleFocus(s,now),'current');}
   else if(action==='finish'){if(!s||s.id!==expectedId||s.state!==expectedState)return;state.put({...s,activeMs:s.activeMs+(s.state==='active'?now-s.stateChangedAt:0),state:'ended',stateChangedAt:now,endedAt:now,focusMs:s.focusMs+(s.focusOn?now-(s.focusChangedAt??s.stateChangedAt):0),focusOn:false,events:[...s.events,{type:'end',at:now}]},'draft');state.delete('current');}
   else if(action==='saveDraft'){if(!waiting||waiting.id!==expectedId)return;const record=finish(waiting,waiting.endedAt,method||[]);tx.objectStore('sessions').put({...record,pending:true});state.delete('draft');}
   else throw Error('画面を更新してお試しください。');
  }catch(e){failure=e;tx.abort();}};
  tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error('端末への保存に失敗しました。'));tx.onerror=()=>{};
 });
}
export async function saveConfig(config){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('state','readwrite');t.objectStore('state').put(config,'config');t.oncomplete=res;t.onabort=()=>rej(t.error);});}
export async function acknowledge(ids){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('sessions','readwrite'),s=t.objectStore('sessions');for(const id of ids){const r=s.get(id);r.onsuccess=()=>{if(r.result)s.put({...r.result,pending:false});};}t.oncomplete=res;t.onabort=()=>rej(t.error);});}
export async function exportBackup(){const{current,draft,rows}=await readAll();return{schema_version:2,exported_at:new Date().toISOString(),current,draft,sessions:rows};}
