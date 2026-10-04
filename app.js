import {readAll,change} from './db.js';
import {duration,formatTime,localDate,SKILL_LABELS} from './core.js';
import {sync} from './sync.js';
const $=id=>document.getElementById(id);
let snapshot, busy=false, error='', channel;
try{channel=new BroadcastChannel('four-study');channel.onmessage=()=>refresh();}catch{}
function render(){
  if(!snapshot)return;
  const {current,rows,config}=snapshot;
  $('date').textContent=new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(new Date());
  $('home').hidden=!!current;$('session').hidden=!current;
  try{
    if(current){$('skill').textContent=SKILL_LABELS[current.skill];$('clock').textContent=formatTime(duration(current,Date.now()).study_seconds);$('toggle').textContent=current.mode==='active'?'一時停止':'再開';$('paused').textContent=current.mode==='paused'?'PAUSED':'\u00a0';$('session').classList.toggle('is-paused',current.mode==='paused');}
    else {const today=localDate(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone);$('today').textContent=formatTime(rows.filter(r=>r.local_date===today).reduce((sum,r)=>sum+r.study_seconds,0),false);}
  }catch(e){error=e.message;}
  const pending=rows.filter(r=>r.pending).length;
  $('status').textContent=error || (pending?`端末に保存済み · 未送信 ${pending}件`:(!config.endpoint?'端末に保存します · 接続設定は日付から':''));
}
async function refresh(){try{snapshot=await readAll();render();}catch(e){$('status').textContent='端末に保存できません。ブラウザの保存設定・空き容量を確認してください。';document.querySelectorAll('button').forEach(b=>b.disabled=true);}}
async function act(action,skill){
  if(busy)return;busy=true;error='';
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await change(action,skill,snapshot?.current?.id,snapshot?.current?.mode);channel?.postMessage('changed');await refresh();void send();}
  catch(e){error=e.message||'保存できませんでした。もう一度お試しください。';render();}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function send(){try{await sync();error='';}catch(e){error='未送信の記録は端末に保持しています。接続設定は日付から。';}await refresh();}
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>act('start',b.dataset.skill));$('finish').onclick=()=>act('finish');$('toggle').onclick=()=>act('toggle');
await refresh();void send();setInterval(render,250);setInterval(send,30000);
addEventListener('online',()=>void send());document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refresh();void send();}});addEventListener('pageshow',()=>void refresh());
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{$('status').textContent='オフライン起動を準備できませんでした。HTTPSで開いてください。';});
