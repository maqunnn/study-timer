/** Belajar: one session per row, stored in a single Raw Sessions sheet. */
const HEADERS = ['session_id','local_date','learning_method','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','skills','focus_mode','timezone','recorded_at'];
const METHODS = ['material','vocabulary','ai','other'];
const SKILLS = ['listening','speaking','reading','writing'];
const OLD_ANALYSIS_SHEETS = ['Summary','Daily','Weekly','Monthly','Methods','Skills','Method Skills','Weekdays','Hours','Focus','Analysis Sessions'];

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('SheetsからApps Scriptを開いてください。');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', book.getId());
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''));
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    rawSheet_(book);
    // Remove only analysis tabs created by the previous Belajar version.
    OLD_ANALYSIS_SHEETS.forEach(name => { const oldSheet=book.getSheetByName(name); if (oldSheet) book.deleteSheet(oldSheet); });
  } finally { lock.releaseLock(); }
}

function book_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SETUP_REQUIRED');
  return SpreadsheetApp.openById(id);
}

function rawSheet_(book) {
  let sheet = book.getSheetByName('Raw Sessions');
  if (!sheet) sheet = book.insertSheet('Raw Sessions');
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) {
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  } else {
    const oldHeaders = sheet.getRange(1,1,1,lastColumn).getValues()[0].map(String);
    if (oldHeaders.slice(0,HEADERS.length).join('|') === HEADERS.join('|') && oldHeaders.length === HEADERS.length) {
      sheet.setFrozenRows(1);
      return sheet;
    }
    const legacy = [
      ['session_id','local_date','learning_method','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','skills','focus_mode','focus_seconds','timezone','recorded_at','events'],
      ['session_id','local_date','skill','start_at','end_at','study_seconds','pause_seconds','elapsed_seconds','timezone','recorded_at'],
      ['session_id','date','skill','start_at','end_at','study_sec','pause_sec','total_sec','timezone','created_at']
    ];
    const normalized = oldHeaders.slice(0, legacy[0].length);
    const schema = legacy.find(x => x.join('|') === normalized.join('|'));
    // Accept the older release whose first heading could be a pasted URL by mistake.
    const shifted = normalized.slice(1).join('|') === legacy[1].slice(1).join('|');
    if (!schema && !shifted) throw new Error('HEADER_MISMATCH');
    const index = {};
    oldHeaders.forEach((h,i) => { index[h] = i; });
    if (shifted) index.session_id = 0;
    const oldRows = lastRow > 1 ? sheet.getRange(2,1,lastRow-1,lastColumn).getValues() : [];
    const get = (row, names, fallback='') => {
      for (const name of names) if (index[name] !== undefined) return row[index[name]];
      return fallback;
    };
    const converted = oldRows.map(row => {
      const oldSkill = String(get(row,['skill'],'')).toLowerCase();
      let skills = get(row,['skills'],'');
      if (!skills) skills = JSON.stringify(SKILLS.includes(oldSkill) ? [oldSkill] : []);
      return [get(row,['session_id']),get(row,['local_date','date']),get(row,['learning_method'],'other'),
        get(row,['start_at']),get(row,['end_at']),get(row,['study_seconds','study_sec'],0),
        get(row,['pause_seconds','pause_sec'],0),get(row,['elapsed_seconds','total_sec'],0),skills,
        get(row,['focus_mode'],'off'),get(row,['timezone']),get(row,['recorded_at','created_at'])];
    });
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    if (converted.length) sheet.getRange(2,1,converted.length,HEADERS.length).setValues(converted);
    if (lastColumn > HEADERS.length) sheet.getRange(1,HEADERS.length+1,lastRow,lastColumn-HEADERS.length).clearContent();
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
  return sheet;
}

function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ok:true,service:'Belajar',schema_version:3}); }

function doPost(e) {
  let lock;
  try {
    const text = e && e.postData && e.postData.contents;
    if (!text || text.length > 200000) throw new Error('INVALID_REQUEST');
    const body = JSON.parse(text);
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!token || typeof body.token !== 'string' || body.token !== token) throw new Error('UNAUTHORIZED');
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const book = book_();
    const sheet = rawSheet_(book);
    if (body.action === 'ping') return json_({ok:true,schema_version:3});
    if (body.action !== 'save' || !Array.isArray(body.sessions) || body.sessions.length < 1 || body.sessions.length > 20) throw new Error('INVALID_REQUEST');
    const batch = body.sessions.map(validate_);
    const oldRows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.length).getValues() : [];
    const known = new Map(oldRows.map(row => [String(row[0]),row]));
    const additions = [];
    const acknowledgements = [];
    for (const session of batch) {
      const comparable = HEADERS.slice(0,-1).map(key => session[key]);
      if (known.has(session.session_id)) {
        const prior = known.get(session.session_id).slice(0,-1);
        if (comparable.some((value,i) => String(value) !== String(prior[i]))) throw new Error('ID_CONFLICT');
      } else {
        const row = [...comparable,new Date().toISOString()];
        additions.push(row);
        known.set(session.session_id,row);
      }
      acknowledgements.push(session.session_id);
    }
    if (additions.length) {
      const first = sheet.getLastRow()+1;
      const last = first+additions.length-1;
      if (last > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
      sheet.getRange(first,1,additions.length,5).setNumberFormat('@');
      sheet.getRange(first,6,additions.length,3).setNumberFormat('0');
      sheet.getRange(first,9,additions.length,4).setNumberFormat('@');
      sheet.getRange(first,1,additions.length,HEADERS.length).setValues(additions);
      SpreadsheetApp.flush();
    }
    return json_({ok:true,ack:acknowledgements});
  } catch (error) {
    const knownErrors = ['SETUP_REQUIRED','HEADER_MISMATCH','INVALID_REQUEST','UNAUTHORIZED','INVALID_SESSION','ID_CONFLICT'];
    return json_({ok:false,error:knownErrors.includes(error.message) ? error.message : 'SERVER_BUSY_OR_ERROR'});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function validate_(s) {
  const fail = () => { throw new Error('INVALID_SESSION'); };
  if (!s || typeof s !== 'object' || typeof s.session_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.session_id)) fail();
  if (!METHODS.includes(s.learning_method) || typeof s.skills !== 'string') fail();
  let skills;
  try { skills = JSON.parse(s.skills); } catch (_) { fail(); }
  if (!Array.isArray(skills) || skills.some(x => !SKILLS.includes(x)) || new Set(skills).size !== skills.length || JSON.stringify(SKILLS.filter(x => skills.includes(x))) !== s.skills) fail();
  for (const key of ['start_at','end_at']) if (typeof s[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s[key])) fail();
  let start, end;
  try { start=Date.parse(s.start_at); end=Date.parse(s.end_at); if (new Date(start).toISOString() !== s.start_at || new Date(end).toISOString() !== s.end_at) fail(); } catch (_) { fail(); }
  if (start > end || end > Date.now()+300000) fail();
  for (const key of ['study_seconds','pause_seconds','elapsed_seconds']) if (!Number.isSafeInteger(s[key]) || s[key] < 0) fail();
  if (s.elapsed_seconds !== Math.floor((end-start)/1000) || s.study_seconds+s.pause_seconds !== s.elapsed_seconds) fail();
  if (!['off','self_reported'].includes(s.focus_mode)) fail();
  if (typeof s.timezone !== 'string' || s.timezone.length > 100) fail();
  let date;
  try { date = Utilities.formatDate(new Date(start),s.timezone,'yyyy-MM-dd'); } catch (_) { fail(); }
  if (date !== s.local_date) fail();
  return s;
}
