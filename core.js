export const SKILL_LABELS = {Listening:'聞く', Speaking:'話す', Reading:'読む', Writing:'書く'};
export const SKILLS = ['Listening', 'Speaking', 'Reading', 'Writing'];
export function localDate(ms, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(ms);
  return ['year','month','day'].map(k => parts.find(p => p.type === k).value).join('-');
}
export function start(skill, now, timezone, id) {
  if (!SKILLS.includes(skill)) throw Error('技能が正しくありません。');
  return {id, skill, timezone, started:now, changed:now, mode:'active', activeMs:0};
}
export function duration(s, now) {
  if (now < s.changed) throw Error('端末の時計が戻っています。日時設定を確認してください。');
  const elapsedMs = now - s.started;
  const activeMs = s.activeMs + (s.mode === 'active' ? now - s.changed : 0);
  return {study_seconds:Math.floor(activeMs / 1000), elapsed_seconds:Math.floor(elapsedMs / 1000), pause_seconds:Math.floor(elapsedMs / 1000) - Math.floor(activeMs / 1000)};
}
export function toggle(s, now) {
  duration(s, now);
  return {...s, activeMs:s.activeMs + (s.mode === 'active' ? now-s.changed : 0), mode:s.mode === 'active' ? 'paused' : 'active', changed:now};
}
export function finish(s, now) {
  return {session_id:s.id, local_date:localDate(s.started, s.timezone), skill:s.skill, start_at:new Date(s.started).toISOString(), end_at:new Date(now).toISOString(), ...duration(s, now), timezone:s.timezone};
}
export function formatTime(seconds, showSeconds=true) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s/3600), Math.floor(s/60)%60, ...(showSeconds ? [s%60] : [])].map(n=>String(n).padStart(2,'0')).join(':');
}
