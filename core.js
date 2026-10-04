export const METHODS=['material','vocabulary','ai','other'];
export const METHOD_LABELS={material:'教材',vocabulary:'単語',ai:'AI',other:'その他'};
export const SKILLS=['speaking','writing','reading','listening'];
export const SKILL_LABELS={speaking:'話す',writing:'書く',reading:'読む',listening:'聞く'};
export const SKILL_CODES=['listening','speaking','reading','writing'];
export function localDate(ms,timezone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ms);
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function start(method,now,timezone,id){
  if(!METHODS.includes(method))throw Error('学習方法を選び直してください。');
  return{id,method,timezone,startedAt:now,state:'active',stateChangedAt:now,activeMs:0,focusOn:false,focusChangedAt:null,focusMs:0,events:[{type:'start',at:now}]};
}
export function duration(s,now){
  if(!Number.isFinite(now)||now<s.stateChangedAt||now<s.startedAt)throw Error('端末の時刻が前に戻っています。日時設定を確認してください。');
  const elapsedMs=now-s.startedAt;
  const studyMs=s.activeMs+(s.state==='active'?now-s.stateChangedAt:0);
  const focusMs=s.focusMs+(s.focusOn&&s.state==='active'?now-(s.focusChangedAt??s.stateChangedAt):0);
  return{study_seconds:Math.floor(studyMs/1000),elapsed_seconds:Math.floor(elapsedMs/1000),pause_seconds:Math.floor((elapsedMs-studyMs)/1000),focus_seconds:Math.floor(focusMs/1000)};
}
export function setPaused(s,now){
  const d=duration(s,now);if(s.state==='paused')return s;
  return{...s,activeMs:s.activeMs+(now-s.stateChangedAt),state:'paused',stateChangedAt:now,focusMs:s.focusMs+(s.focusOn?now-(s.focusChangedAt??s.stateChangedAt):0),focusChangedAt:s.focusOn?now:null,events:[...s.events,{type:'pause',at:now}]};
}
export function resume(s,now){
  duration(s,now);if(s.state==='active')return s;
  return{...s,state:'active',stateChangedAt:now,focusChangedAt:s.focusOn?now:null,events:[...s.events,{type:'resume',at:now}]};
}
export function toggleFocus(s,now){
  duration(s,now);if(s.state!=='active')return s;
  const focusMs=s.focusMs+(s.focusOn?now-(s.focusChangedAt??s.stateChangedAt):0),focusOn=!s.focusOn;
  return{...s,focusMs,focusOn,focusChangedAt:focusOn?now:null,events:[...s.events,{type:focusOn?'focus_on':'focus_off',at:now}]};
}
export function finish(s,now,skills){
  const d=duration(s,now),normalized=SKILL_CODES.filter(x=>skills.includes(x));
  if(skills.some(x=>!SKILL_CODES.includes(x)))throw Error('技能を選び直してください。');
  return{session_id:s.id,local_date:localDate(s.startedAt,s.timezone),learning_method:s.method,start_at:new Date(s.startedAt).toISOString(),end_at:new Date(now).toISOString(),...d,skills:JSON.stringify(normalized),focus_mode:s.focusMs+(s.focusOn&&s.state==='active'?now-(s.focusChangedAt??s.stateChangedAt):0)>0?'self_reported':'off',timezone:s.timezone,events:JSON.stringify([...s.events,{type:'end',at:now}])};
}
export function formatTime(seconds,withSeconds=false){const s=Math.max(0,Math.floor(seconds));return[...(withSeconds?[Math.floor(s/3600),Math.floor(s/60)%60,s%60]:[Math.floor(s/3600),Math.floor(s/60)%60])].map(n=>String(n).padStart(2,'0')).join(':');}
export function studyMilliseconds(session,now){return duration(session,now).study_seconds*1000;}
