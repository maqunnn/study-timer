import{readAll,change,db}from'./db.js';
import{duration,formatTime,localDate,METHOD_LABELS,SKILL_CODES}from'./core.js';
import{sync}from'./sync.js';
const $=id=>document.getElementById(id);let data=null,working=false,notice='',chosen=new Set(),chosenDraftId=null,channel;
try{channel=new BroadcastChannel('study-timer-v2');channel.onmessage=()=>refresh();}catch{}
function updateStatus(){const pending=data?.rows.filter(x=>x.pending).length||0;$('status').textContent=notice||(pending?'未送信 '+pending+'件 · 接続時に自動送信':data?.config.endpoint?'':'');$('status').classList.toggle('has-content',!!$('status').textContent);}
function render(){if(!data)return;const{current,draft,rows}=data;
  $('home').hidden=!!(current||draft);$('timer').hidden=!current;$('skillPicker').hidden=!draft;
  try{
    if(!current&&!draft){const today=localDate(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone);const total=rows.filter(r=>r.local_date===today).reduce((sum,r)=>sum+r.study_seconds,0);$('today').textContent=formatTime(total);}
    if(current){$('method').textContent=METHOD_LABELS[current.method]||'その他';$('clock').textContent=formatTime(duration(current,Date.now()).study_seconds,true);$('timerState').textContent=current.state==='active'?'計測中':'一時停止中';$('timerState').dataset.state=current.state;$('pause').textContent=current.state==='active'?'一時停止':'再開';$('focus').textContent=current.focusOn?'FOCUS ON':'FOCUS OFF';$('focus').setAttribute('aria-pressed',String(current.focusOn));}
    if(draft){$('sessionSummary').textContent=(METHOD_LABELS[draft.method]||'その他')+' ・ '+formatTime(Math.floor(draft.activeMs/1000),true);if(chosenDraftId!==draft.id){chosenDraftId=draft.id;chosen.clear();document.querySelectorAll('[data-skill]').forEach(b=>b.setAttribute('aria-pressed','false'));}}
  }catch(e){notice=e.message;}
  updateStatus();
}
async function refresh(){try{data=await readAll();render();}catch(e){notice='端末に保存できません。ブラウザの保存領域を確認してください。';$('status').textContent=notice;$('status').classList.add('has-content');document.querySelectorAll('button').forEach(b=>b.disabled=true);}}
async function act(action,method,expectedId,expectedState){if(working)return;working=true;notice='';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await change(action,method,expectedId,expectedState);channel?.postMessage('updated');await refresh();void send();}catch(e){notice=e.message||'保存に失敗しました。もう一度お試しください。';render();}finally{working=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function send(){try{await sync();notice='';}catch{notice='未送信の記録は端末に保存されています。オンライン時に再送します。';}await refresh();}
document.querySelectorAll('[data-method]').forEach(b=>b.onclick=()=>act('start',b.dataset.method));
$('end').onclick=()=>{const s=data?.current;if(s)void act('finish',null,s.id,s.state);};
$('pause').onclick=()=>{const s=data?.current;if(s)void act(s.state==='active'?'pause':'resume',null,s.id,s.state);};
$('focus').onclick=()=>{const s=data?.current;if(s)void act('focus',null,s.id,s.state);};
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{const x=b.dataset.skill;if(chosen.has(x))chosen.delete(x);else chosen.add(x);b.setAttribute('aria-pressed',String(chosen.has(x)));});
$('save').onclick=()=>{const d=data?.draft;if(d)void act('saveDraft',SKILL_CODES.filter(x=>chosen.has(x)),d.id);};
await refresh();void send();setInterval(()=>{if(data?.current)render();},1000);setInterval(()=>void send(),30000);addEventListener('online',()=>void send());addEventListener('pageshow',()=>{void refresh();void send();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refresh();void send();}});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{notice='初回起動はオンラインで開いてください。';updateStatus();});
try{await navigator.storage?.persist?.();}catch{}
