import {readAll,acknowledge} from './db.js';
export function validateConfig(config) {
  const url=new URL(config.endpoint);
  if(url.origin!=='https://script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash) throw Error('Apps Scriptの /exec で終わる公開URLを入力してください。');
  if(!/^[a-f0-9]{64}$/.test(config.token)) throw Error('setupで作成された64文字のトークンを入力してください。');
}
export async function request(config, body) {
  validateConfig(config);
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),25000);
  try {
    // A simple CORS request: no custom headers, no preflight, no opaque success.
    const response=await fetch(config.endpoint,{method:'POST',mode:'cors',credentials:'omit',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,token:config.token}),signal:controller.signal});
    if(!response.ok) throw Error('接続先が応答しませんでした。');
    const data=await response.json();
    if(data.ok!==true) throw Error(data.error||'保存を確認できませんでした。');
    return data;
  } finally {clearTimeout(timeout);}
}
let running=false, failures=0, nextTry=0;
export async function sync(force=false) {
  if(running || (!force && Date.now()<nextTry)) return;
  running=true;
  try {
    const {rows,config}=await readAll();
    const pending=rows.filter(r=>r.pending);
    if(!pending.length || !config.endpoint || !navigator.onLine) return;
    for(let i=0;i<pending.length;i+=20){
      const batch=pending.slice(i,i+20), data=await request(config,{action:'save',sessions:batch.map(({pending,...row})=>row)});
      if(!Array.isArray(data.ack) || batch.some(r=>!data.ack.includes(r.session_id))) throw Error('保存の確認待ちです。記録は端末に残っています。');
      await acknowledge(batch.map(r=>r.session_id));
    }
    failures=0;nextTry=0;
  } catch(e) {
    failures++;nextTry=Date.now()+Math.min(300000,5000*2**Math.min(failures,6));
    throw e;
  } finally {running=false;}
}
