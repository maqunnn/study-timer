import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {localDate} from '../core.js';

const code = fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');
function backend(oldSchema='none') {
  const legacyHeaders = oldSchema === 'v2'
    ? ['session_id','local_date','learning_method','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','skills','focus_mode','focus_seconds','timezone','recorded_at','events']
    : oldSchema === 'original'
    ? ['session_id','date','skill','start_at','end_at','study_sec','pause_sec','total_sec','timezone','created_at']
    : oldSchema === 'urlHeader'
      ? ['https://script.google.com/macros/s/example/exec','local_date','skill','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','timezone','recorded_at']
      : [];
  const oldData = oldSchema === 'v2'
    ? ['f4d4f365-b29c-45c1-a06b-f9da2c08aebd','2026-10-04','ai','2026-10-04T01:00:00.000Z','2026-10-04T01:10:00.000Z',480,120,600,'["listening","speaking"]','self_reported',120,'Asia/Tokyo','2026-10-04T01:10:01.000Z','[{"type":"start"}]']
    : ['f4d4f365-b29c-45c1-a06b-f9da2c08aebd','2026-10-04','Speaking','2026-10-04T01:00:00.000Z','2026-10-04T01:10:00.000Z',480,120,600,'Asia/Tokyo','2026-10-04T01:10:01.000Z'];
  const rows = legacyHeaders.length ? [legacyHeaders,oldData] : [];
  let locked=false, loseAck=false;
  const sheet={
    getLastRow:()=>rows.length,
    getLastColumn:()=>Math.max(0,...rows.map(row=>row.length)),
    getMaxRows:()=>1000,
    setFrozenRows(){}, insertRowsAfter(){},
    getRange(r,c,n,m){return{
      getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??'')),
      setValues(data){data.forEach((row,i)=>{rows[r-1+i]||=[];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v);});return this;},
      clearContent(){for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(rows[r-1+i])rows[r-1+i][c-1+j]='';return this;},
      setNumberFormat(){return this;}, setFontWeight(){return this;}
    };}
  };
  const sheets={'Raw Sessions':sheet,...Object.fromEntries(['Summary','Daily','Weekly','Monthly','Methods','Skills','Method Skills','Weekdays','Hours','Focus','Analysis Sessions','My analysis'].map(name=>[name,{name}]))};
  const book={getId:()=> 'sheet',getSheetByName:name=>sheets[name]||null,insertSheet:name=>(sheets[name]=sheet),deleteSheet:old=>{delete sheets[old.name];},get sheets(){return sheets;}};
  const ctx=vm.createContext({console,Date,Map,Number,JSON,Intl,Set,
    Utilities:{formatDate:(date,tz)=>localDate(date.getTime(),tz),getUuid:()=> '01234567-89ab-4cde-8fab-0123456789ab'},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='API_TOKEN'?'c'.repeat(64):'sheet',setProperty(){}})},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:()=>book,flush(){if(loseAck){loseAck=false;throw Error('ack lost');}}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType:()=>JSON.parse(t)})}
  });
  vm.runInContext(code,ctx);
  return{rows,book,setup:()=>ctx.setup(),call:b=>ctx.doPost({postData:{contents:JSON.stringify(b)}}),loseAck(){loseAck=true;}};
}
const session=()=>{const a=Date.parse('2026-10-04T01:00:00.000Z'),b=a+600000;return{session_id:'f4d4f365-b29c-45c1-a06b-f9da2c08aebd',local_date:'2026-10-04',learning_method:'ai',start_at:new Date(a).toISOString(),end_at:new Date(b).toISOString(),study_seconds:480,pause_seconds:120,elapsed_seconds:600,skills:'["listening","speaking"]',focus_mode:'self_reported',timezone:'Asia/Tokyo'};};
const post=(s)=>({token:'c'.repeat(64),action:'save',sessions:[s]});
const headers=['session_id','local_date','learning_method','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','skills','focus_mode','timezone','recorded_at'];

test('server source parses and ping confirms readiness',()=>{assert.doesNotThrow(()=>new vm.Script(code));const b=backend();assert.deepEqual(b.call({action:'ping',token:'c'.repeat(64)}),{ok:true,schema_version:3});});
test('legacy Raw Sessions migrates while preserving the old row',()=>{const b=backend('original');assert.deepEqual(b.call({action:'ping',token:'c'.repeat(64)}),{ok:true,schema_version:3});assert.deepEqual(b.rows[0].slice(0,12),headers);assert.equal(b.rows[1][0],'f4d4f365-b29c-45c1-a06b-f9da2c08aebd');assert.equal(b.rows[1][2],'other');assert.equal(b.rows[1][8],'["speaking"]');});
test('the previous fourteen-column sheet is reduced while keeping useful session data',()=>{const b=backend('v2');assert.equal(b.call({action:'ping',token:'c'.repeat(64)}).ok,true);assert.equal(b.rows[0].length,14);assert.equal(b.rows[1][0],'f4d4f365-b29c-45c1-a06b-f9da2c08aebd');assert.equal(b.rows[1][2],'ai');assert.equal(b.rows[1][8],'["listening","speaking"]');assert.equal(b.rows[1][9],'self_reported');assert.equal(b.rows[1][10],'Asia/Tokyo');assert.equal(b.rows[1][11],'2026-10-04T01:10:01.000Z');});
test('older URL-header migration preserves record identifiers',()=>{const b=backend('urlHeader');assert.deepEqual(b.call({action:'ping',token:'c'.repeat(64)}),{ok:true,schema_version:3});assert.equal(b.rows[1][0],'f4d4f365-b29c-45c1-a06b-f9da2c08aebd');assert.equal(b.rows[1][1],'2026-10-04');});
test('a saved session uses only the twelve purpose-specific columns',()=>{const b=backend();assert.equal(b.call(post(session())).ok,true);assert.deepEqual(b.rows[0],headers);assert.equal(b.rows[1].length,12);});
test('setup removes only known generated analysis tabs',()=>{const b=backend();b.setup();for(const name of ['Summary','Daily','Weekly','Monthly','Methods','Skills','Method Skills','Weekdays','Hours','Focus','Analysis Sessions'])assert.equal(b.book.getSheetByName(name),null);assert.ok(b.book.getSheetByName('My analysis'));assert.deepEqual(b.rows[0],headers);});
test('duplicate id is idempotent after an acknowledgment is lost',()=>{const b=backend(),payload=post(session());b.loseAck();assert.equal(b.call(payload).ok,false);assert.equal(b.call(payload).ok,true);assert.equal(b.rows.length,2);});
test('bad tokens and malformed sessions are rejected',()=>{const b=backend();assert.equal(b.call({...post(session()),token:'wrong'}).error,'UNAUTHORIZED');for(const bad of [{...session(),study_seconds:-1},{...session(),learning_method:'bad'},{...session(),skills:'["unknown"]'},{...session(),local_date:'2026-10-03'},{...session(),focus_mode:'automatic'}])assert.equal(b.call(post(bad)).error,'INVALID_SESSION');assert.equal(b.rows.length,1);});
test('same id with changed method or skills conflicts',()=>{const b=backend(),s=session();assert.equal(b.call(post(s)).ok,true);assert.equal(b.call(post({...s,learning_method:'other'})).error,'ID_CONFLICT');assert.equal(b.call(post({...s,skills:'[]'})).error,'ID_CONFLICT');assert.equal(b.rows.length,2);});
test('duplicate records in one batch produce one raw row',()=>{const b=backend(),s=session();assert.equal(b.call({token:'c'.repeat(64),action:'save',sessions:[s,s]}).ok,true);assert.equal(b.rows.length,2);});
