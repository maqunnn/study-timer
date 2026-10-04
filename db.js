import {start, toggle, finish} from './core.js';
let opening;
export function db() {
  return opening ||= new Promise((resolve,reject) => {
    const r = indexedDB.open('four-study-v1',1);
    r.onupgradeneeded = () => {r.result.createObjectStore('state'); r.result.createObjectStore('sessions',{keyPath:'session_id'});};
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error('別のタブを閉じて開き直してください。'));
  });
}
export async function readAll() {
  const d = await db();
  return new Promise((resolve,reject) => {
    const tx=d.transaction(['state','sessions']);
    const s=tx.objectStore('state').get('current'), rows=tx.objectStore('sessions').getAll(), cfg=tx.objectStore('state').get('config');
    tx.oncomplete=()=>resolve({current:s.result||null,rows:rows.result,config:cfg.result||{endpoint:'',token:''}});
    tx.onerror=()=>reject(tx.error);
  });
}
// One transaction serializes changes across tabs and atomically ends + queues a session.
export async function change(action, skill, expectedId, expectedMode) {
  const d=await db();
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(['state','sessions'],'readwrite'); const state=tx.objectStore('state');
    let failure;
    const req=state.get('current');
    req.onsuccess=()=>{
      try {
        const s=req.result, now=Date.now();
        if (action==='start') {
          if(s) return;
          state.put(start(skill,now,Intl.DateTimeFormat().resolvedOptions().timeZone,crypto.randomUUID()),'current');
        } else {
          if(!s || s.id!==expectedId || s.mode!==expectedMode) return;
          if(action==='toggle') state.put(toggle(s,now),'current');
          if(action==='finish') {tx.objectStore('sessions').add({...finish(s,now),pending:true}); state.delete('current');}
        }
      } catch(e) {failure=e;tx.abort();}
    };
    tx.oncomplete=resolve; tx.onabort=()=>reject(failure||tx.error||Error('保存できませんでした。')); tx.onerror=()=>{};
  });
}
export async function saveConfig(config) {
  const d=await db();
  return new Promise((resolve,reject)=>{const t=d.transaction('state','readwrite');t.objectStore('state').put(config,'config');t.oncomplete=resolve;t.onabort=()=>reject(t.error);});
}
export async function acknowledge(ids) {
  const d=await db();
  return new Promise((resolve,reject)=>{
    const t=d.transaction('sessions','readwrite'), store=t.objectStore('sessions');
    for(const id of ids){const r=store.get(id);r.onsuccess=()=>{if(r.result)store.put({...r.result,pending:false});};}
    t.oncomplete=resolve;t.onabort=()=>reject(t.error);
  });
}
