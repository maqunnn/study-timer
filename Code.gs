/** 4 — one row per session. This endpoint accepts only a private bearer token. */
const HEADERS=['session_id','local_date','learning_method','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','skills','focus_mode','focus_seconds','timezone','recorded_at','events'];
const OLD_HEADERS=['session_id','date','skill','start_at','end_at','study_sec','pause_sec','total_sec','timezone','created_at'];
const EARLIER_HEADERS=['session_id','local_date','skill','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','timezone','recorded_at'];
const METHODS=['material','vocabulary','ai','other'];
const SKILLS=['listening','speaking','reading','writing'];
const EVENT_TYPES=['start','pause','resume','focus_on','focus_off','end'];
function onOpen(){SpreadsheetApp.getUi().createMenu('4 学習ログ').addItem('分析シートを更新','rebuildAnalysis').addToUi();}
function setup(){
 const book=SpreadsheetApp.getActiveSpreadsheet();if(!book)throw Error('Sheetsからスクリプトを開いてください。');
 const props=PropertiesService.getScriptProperties();props.setProperty('SPREADSHEET_ID',book.getId());if(!props.getProperty('API_TOKEN'))props.setProperty('API_TOKEN',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
 const lock=LockService.getScriptLock();lock.waitLock(20000);try{rawSheet_(book);}finally{lock.releaseLock();}
 console.log('初期化完了。API_TOKENはスクリプト プロパティで確認できます。');
}
function book_(){const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');if(!id)throw Error('SETUP_REQUIRED');return SpreadsheetApp.openById(id);}
function rawSheet_(book){
 let sheet=book.getSheetByName('Raw Sessions');if(!sheet)sheet=book.insertSheet('Raw Sessions');
 if(sheet.getLastRow()===0){sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);sheet.setFrozenRows(1);sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');return sheet;}
 const columns=sheet.getLastColumn(),actual=sheet.getRange(1,1,1,columns).getValues()[0].slice(0,10);
 if(actual.join('|')===HEADERS.slice(0,10).join('|')){
  // schema v2 already has the new column family
  const existing=sheet.getRange(1,1,1,HEADERS.length).getValues()[0];if(existing.some((x,i)=>x!==HEADERS[i]))throw Error('HEADER_MISMATCH');return sheet;
 }
 const legacySchema=actual.join('|'),shiftedEarlier=actual.slice(1).join('|')===EARLIER_HEADERS.slice(1).join('|');if(legacySchema!==EARLIER_HEADERS.join('|')&&legacySchema!==OLD_HEADERS.join('|')&&!shiftedEarlier)throw Error('HEADER_MISMATCH');
 // One-time non-destructive data migration from the first released schema.
 const prior=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues():[];
 sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  if(prior.length){const converted=prior.map(r=>{const skill=String(r[2]).toLowerCase();return[r[0],r[1],'other',r[3],r[4],r[5],r[6],r[7],JSON.stringify(SKILLS.includes(skill)?[skill]:[]),'off',0,r[8],r[9],'[]'];});sheet.getRange(2,1,converted.length,HEADERS.length).setValues(converted);}
 sheet.setFrozenRows(1);sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');return sheet;
}
function json_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
function doGet(){return json_({ok:true,service:'4',schema_version:2});}
function doPost(e){let lock;try{
 const text=e&&e.postData&&e.postData.contents;if(!text||text.length>200000)throw Error('INVALID_REQUEST');const body=JSON.parse(text),token=PropertiesService.getScriptProperties().getProperty('API_TOKEN');
 if(!token||typeof body.token!=='string'||body.token!==token)throw Error('UNAUTHORIZED');
 lock=LockService.getScriptLock();lock.waitLock(20000);const book=book_(),sheet=rawSheet_(book);
 if(body.action==='ping')return json_({ok:true,schema_version:2});
 if(body.action!=='save'||!Array.isArray(body.sessions)||body.sessions.length<1||body.sessions.length>20)throw Error('INVALID_REQUEST');
 const batch=body.sessions.map(validate_),prior=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.length).getValues():[],known=new Map(prior.map(r=>[String(r[0]),r]));
 const append=[],acks=[];for(const s of batch){const keys=HEADERS.filter(h=>h!=='recorded_at'),row=keys.map(h=>s[h]);if(known.has(s.session_id)){const old=known.get(s.session_id);let j=0;for(let i=0;i<HEADERS.length;i++){if(HEADERS[i]==='recorded_at')continue;if(String(row[j++])!==String(old[i]))throw Error('ID_CONFLICT');}}else{const full=HEADERS.map(h=>h==='recorded_at'?new Date().toISOString():s[h]);append.push(full);known.set(s.session_id,full);}acks.push(s.session_id);}
 if(append.length){const at=sheet.getLastRow()+1,last=at+append.length-1;if(last>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());sheet.getRange(at,1,append.length,5).setNumberFormat('@');sheet.getRange(at,6,append.length,3).setNumberFormat('0');sheet.getRange(at,9,append.length,3).setNumberFormat('@');sheet.getRange(at,12,append.length,3).setNumberFormat('@');sheet.getRange(at,1,append.length,HEADERS.length).setValues(append);SpreadsheetApp.flush();}
 return json_({ok:true,ack:acks});
 }catch(e){const known=['SETUP_REQUIRED','HEADER_MISMATCH','INVALID_REQUEST','UNAUTHORIZED','INVALID_SESSION','ID_CONFLICT'];return json_({ok:false,error:known.includes(e.message)?e.message:'SERVER_BUSY_OR_ERROR'});}finally{if(lock&&lock.hasLock())lock.releaseLock();}}
function validate_(s){const fail=()=>{throw Error('INVALID_SESSION');};
 if(!s||typeof s!=='object'||typeof s.session_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.session_id))fail();
 if(!METHODS.includes(s.learning_method)||typeof s.skills!=='string')fail();
 let skills;try{skills=JSON.parse(s.skills);}catch(e){fail();}if(skills.some(x=>!SKILLS.includes(x))||new Set(skills).size!==skills.length||JSON.stringify(SKILLS.filter(x=>skills.includes(x)))!==s.skills)fail();
 for(const k of ['start_at','end_at'])if(typeof s[k]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s[k]))fail();
 let start,end;try{start=Date.parse(s.start_at);end=Date.parse(s.end_at);if(new Date(start).toISOString()!==s.start_at||new Date(end).toISOString()!==s.end_at)fail();}catch(e){fail();}if(start>end||end>Date.now()+300000)fail();
 for(const k of ['study_seconds','pause_seconds','elapsed_seconds','focus_seconds'])if(!Number.isSafeInteger(s[k])||s[k]<0)fail();
 if(s.elapsed_seconds!==Math.floor((end-start)/1000)||s.study_seconds+s.pause_seconds!==s.elapsed_seconds||s.focus_seconds>s.study_seconds)fail();
 if(!['off','self_reported'].includes(s.focus_mode)||(s.focus_mode==='off'&&s.focus_seconds!==0))fail();
 if(typeof s.timezone!=='string'||s.timezone.length>100)fail();let date;try{date=Utilities.formatDate(new Date(start),s.timezone,'yyyy-MM-dd');}catch(e){fail();}if(date!==s.local_date)fail();
 if(typeof s.events!=='string'||s.events.length>16000)fail();let events;try{events=JSON.parse(s.events);}catch(e){fail();}if(!Array.isArray(events)||events.length<2||events[0].type!=='start'||events[events.length-1].type!=='end')fail();let last=start;for(const x of events){if(!x||!EVENT_TYPES.includes(x.type)||!Number.isSafeInteger(x.at)||x.at<last||x.at<start||x.at>end)fail();last=x.at;}if(events[events.length-1].at!==end)fail();
 return s;
}
function isoWeek_(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)+3);const thursday=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
function writeSheet_(book,name,headers,rows){const sh=book.getSheetByName(name)||book.insertSheet(name);sh.clearContents();const data=[headers,...rows];if(data.length>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),data.length-sh.getMaxRows());sh.getRange(1,1,data.length,headers.length).setValues(data);sh.setFrozenRows(1);sh.getRange(1,1,1,headers.length).setFontWeight('bold');if(headers.length)sh.autoResizeColumns(1,headers.length);}
function rebuildAnalysis(){const lock=LockService.getScriptLock();lock.waitLock(20000);try{
 const book=book_(),raw=rawSheet_(book),rows=raw.getLastRow()>1?raw.getRange(2,1,raw.getLastRow()-1,HEADERS.length).getValues():[],daily=new Map(),weekly=new Map(),monthly=new Map(),methods=new Map(),skills=new Map(),cross=new Map(),weekdays=new Map(),hours=new Map(),focus=new Map(),detail=[];const days=new Set();let sum=0,pauses=0,elapsed=0,focusSecs=0;
 for(const r of rows){const date=String(r[1]),method=String(r[2]),tz=String(r[11]),start=String(r[3]),study=Number(r[5]),pause=Number(r[6]),all=Number(r[7]),f=Number(r[10]);
  let selected;try{selected=JSON.parse(String(r[8]));}catch(e){selected=[];}const d=new Date(date+'T00:00:00Z'),weekday=(d.getUTCDay()+6)%7+1,week=isoWeek_(date),month=date.slice(0,7),hour=Utilities.formatDate(new Date(start),tz,'HH');
  sum+=study;pauses+=pause;elapsed+=all;focusSecs+=f;if(study>0)days.add(date);
  const eventText=String(r[13]);let eventCount=0;try{eventCount=JSON.parse(eventText).filter(x=>x.type==='pause').length;}catch(e){}
  detail.push([r[0],date,week,month,weekday,Number(hour),method,study,pause,all,JSON.stringify(selected),String(r[9]),f,eventCount]);
  addGroup_(daily,date,study,pause,all,1);addGroup_(weekly,week,study,pause,all,1);addGroup_(monthly,month,study,pause,all,1);addGroup_(methods,method,study,pause,all,1);addGroup_(weekdays,String(weekday),study,pause,all,1);addGroup_(hours,hour,study,pause,all,1);addGroup_(focus,String(r[9]),study,pause,all,1);
  if(selected.length){const base=Math.floor(study/selected.length),extra=study%selected.length;for(let i=0;i<selected.length;i++){const skill=selected[i],share=base+(i<extra?1:0);addGroup_(skills,skill,share,0,share,1);addGroup_(cross,method+' × '+skill,share,0,share,1);}}
 }
 const hdr=['key','session_count','study_seconds','study_hours','average_seconds_per_session','pause_seconds','elapsed_seconds','pause_rate'];const table=m=>[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>[k,v[0],v[1],v[1]/3600,v[0]?v[1]/v[0]:0,v[2],v[3],v[3]?v[2]/v[3]:0]);
 writeSheet_(book,'Analysis Sessions',['session_id','local_date','week_start_monday','month','weekday_mon_1','start_hour','learning_method','study_seconds','pause_seconds','elapsed_seconds','skills','focus_mode','focus_seconds','pause_count'],detail);
 [['Daily',daily],['Weekly',weekly],['Monthly',monthly],['Methods',methods],['Skills',skills],['Method Skills',cross],['Weekdays',weekdays],['Hours',hours],['Focus',focus]].forEach(([n,m])=>writeSheet_(book,n,hdr,table(m)));
 const dates=[...days].sort(),dayNums=dates.map(x=>Date.parse(x+'T00:00:00Z')/86400000);let longest=0,run=0,prev=null;for(const n of dayNums){run=prev!==null&&n===prev+1?run+1:1;longest=Math.max(longest,run);prev=n;}
 const tz=book.getSpreadsheetTimeZone(),today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');let cursor=new Date(today+'T00:00:00Z'),streak=0;if(!days.has(today))cursor.setUTCDate(cursor.getUTCDate()-1);while(days.has(cursor.toISOString().slice(0,10))){streak++;cursor.setUTCDate(cursor.getUTCDate()-1);}
 writeSheet_(book,'Summary',['metric','value'],[['updated_at',new Date().toISOString()],['streak_timezone',tz],['sessions',rows.length],['total_study_hours',sum/3600],['average_seconds_per_session',rows.length?sum/rows.length:0],['average_study_hours_per_active_day',days.size?sum/3600/days.size:0],['active_study_days',days.size],['longest_streak_days',longest],['current_streak_days',streak],['pause_rate',elapsed?pauses/elapsed:0],['focus_hours',focusSecs/3600],['focus_share_of_study',sum?focusSecs/sum:0]]);
 }finally{lock.releaseLock();}}
function addGroup_(map,key,study,pause,elapsed,count){const x=map.get(key)||[0,0,0,0];x[0]+=count;x[1]+=study;x[2]+=pause;x[3]+=elapsed;map.set(key,x);}
