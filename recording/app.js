'use strict';

const APP={
  version:'8.2.0',
  apiKey:'allbarun.rec.apiUrl',
  tokenKey:'allbarun.rec.token',
  targetDate:'',
  data:null,
  loading:false,
  saving:new Set(),
  lastLoaded:0,
  filters:{hideExemptions:true,pendingOnly:false}
};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const jsArg=value=>esc(JSON.stringify(String(value??'')));
const numberOr=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

function toast(message){const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600)}
function setSync(text,kind=''){const node=$('sync-state');node.textContent=text;node.className='pill '+kind}
function apiUrl(){return localStorage.getItem(APP.apiKey)||''}
function token(){return localStorage.getItem(APP.tokenKey)||''}
async function api(action,payload={},override={}){const url=override.url||apiUrl();if(!url)throw new Error('서버 주소가 설정되지 않았습니다.');if(!navigator.onLine)throw new Error('오프라인에서는 저장할 수 없습니다.');const body={action,payload,token:override.token===undefined?token():override.token,pin:override.pin||''};const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);try{const response=await fetch(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});const text=await response.text();let json;try{json=JSON.parse(text)}catch(_){throw new Error('서버 응답을 읽지 못했습니다. 배포 주소와 권한을 확인하세요.')}if(!json.success)throw new Error(json.error?.message||'요청에 실패했습니다.');return json.data}catch(error){if(error?.name==='AbortError')throw new Error('서버 응답이 25초 이상 지연되었습니다. 화면 상태를 확정하지 않았습니다.');throw error}finally{clearTimeout(timer)}}

function isRecordingExempt(student){
  const status=String(student?.status||'').toUpperCase();
  return Boolean(student&&(student.eligible===false||student.plannedAbsence||student.recordingExempt||student.exempt||['EXEMPT','WAIVED','NOT_REQUIRED','SKIPPED','CLOSED'].includes(status)));
}
function recordingExemptLabel(student){
  if(student?.plannedAbsence||String(student?.exemptType||'').toUpperCase()==='PLANNED_ABSENCE')return '예정결석';
  const reason=String(student?.exemptReason||'').trim();
  if(/방학|휴원|휴강|CLOSURE|VACATION/i.test(reason))return '학원 방학 면제';
  return reason||'녹음 면제';
}
function isPendingRecording(student){return !isRecordingExempt(student)&&['UNKNOWN','MISSING'].includes(String(student?.status||'').toUpperCase())}
function mergedClasses(data){
  const map=new Map();
  for(const cls of data?.classes||[])map.set(String(cls.classId),{...cls,students:[...(cls.students||[])],exemptStudents:[]});
  for(const cls of data?.exemptClasses||[]){
    const id=String(cls.classId),current=map.get(id)||{...cls,students:[],exemptStudents:[]};
    current.exemptStudents=[...(cls.students||[])];
    if(current.sortOrder==null)current.sortOrder=cls.sortOrder;
    map.set(id,current);
  }
  return [...map.values()].sort((a,b)=>numberOr(a.sortOrder,999)-numberOr(b.sortOrder,999)||String(a.className||'').localeCompare(String(b.className||''),'ko'));
}
function classDisplayStudents(cls){return [...(cls.students||[]),...(cls.exemptStudents||[])]}
function plannedAbsenceCount(data){
  if(Number.isFinite(Number(data?.plannedAbsenceCount)))return Number(data.plannedAbsenceCount);
  return mergedClasses(data).reduce((sum,cls)=>sum+classDisplayStudents(cls).filter(st=>st.plannedAbsence).length,0);
}
function totalExemptionCount(data){
  if(Number.isFinite(Number(data?.totalExemptions)))return Number(data.totalExemptions);
  return mergedClasses(data).reduce((sum,cls)=>sum+classDisplayStudents(cls).filter(isRecordingExempt).length,0);
}

function updateNetwork(){
  const online=navigator.onLine,node=$('network-state');
  node.textContent=online?'온라인':'오프라인';
  node.className='pill '+(online?'':'offline');
  if(!online)document.querySelectorAll('.student input[type=checkbox],.override-btn').forEach(el=>{el.disabled=true});
  else if(APP.data&&!APP.loading)renderClasses(APP.data);
}
function ensureConnected(){if(!apiUrl()||!token()){$('api-url').value=apiUrl();$('setup-modal').classList.add('show');return false}$('setup-modal').classList.remove('show');return true}
async function connectServer(){const url=$('api-url').value.trim(),pin=$('admin-pin').value.trim();if(!url||!pin){toast('주소와 PIN을 입력하세요.');return}setSync('연결 중','saving');try{const login=await api('login',{}, {url,pin,token:''});localStorage.setItem(APP.apiKey,url);localStorage.setItem(APP.tokenKey,login.token);$('setup-modal').classList.remove('show');toast('연결했습니다.');APP.targetDate='';await loadData(true)}catch(error){setSync('연결 오류','error');toast(error.message)}}
function closeSetupIfConnected(){if(apiUrl()&&token())$('setup-modal').classList.remove('show')}
function openConnectionSettings(){closeSettings();$('api-url').value=apiUrl();$('admin-pin').value='';$('setup-modal').classList.add('show')}
function openSettings(){$('settings-modal').classList.add('show')}
function closeSettings(){$('settings-modal').classList.remove('show')}

async function loadData(force=false,targetDate=APP.targetDate){if(!ensureConnected()||APP.loading)return;APP.loading=true;setSync('서버 확인 중','saving');try{const data=await api('opsDashboard',{targetDate,force});APP.data=data;APP.targetDate=data.targetDate;APP.lastLoaded=Date.now();render(data);setSync('저장 준비','')}catch(error){renderError(error);setSync('오류','error')}finally{APP.loading=false;updateNetwork()}}
function renderError(error){const banner=$('notice-banner');banner.className='notice-banner error';$('notice-title').textContent='불러오기 실패';$('notice-detail').textContent=error.message;$('classes').innerHTML='';$('empty').hidden=false;$('empty').textContent='서버 데이터를 확인하지 못했습니다. 설정에서 연결 상태를 확인하세요.'}
function render(data){renderDates(data.candidates||[]);renderSummary(data);renderClasses(data);$('now-label').textContent=`${data.targetLabel} · 서버 ${data.lastAuthoritativeReadAt}`;$('authoritative-read').textContent=`CoreDB 최종 확인 ${data.lastAuthoritativeReadAt} · ${data.sourceOfTruth}`}
function renderDates(items){$('date-strip').innerHTML=items.map(item=>{const detail=numberOr(item.studentCount)>0?`${numberOr(item.studentCount)}명`:numberOr(item.closureCount)>0?'휴원·면제':numberOr(item.exemptCount)>0?`면제 ${numberOr(item.exemptCount)}명`:'대상 없음';return `<button type="button" class="date-chip ${item.date===APP.targetDate?'active':''}" onclick="selectDate(${jsArg(item.date)})">${esc(item.shortLabel)}<span class="tiny">${esc(detail)}</span></button>`}).join('')}
async function selectDate(date){if(APP.loading||date===APP.targetDate)return;APP.targetDate=date;await loadData(false,date)}

function renderSummary(data){
  const target=numberOr(data.totalStudents),received=numberOr(data.totalReceived),exemptions=totalExemptionCount(data);
  $('m-total').textContent=target;
  $('m-received').textContent=received;
  $('m-absence').textContent=exemptions;
  const serverPending=data.deadlinePassed?data.totalMissing:data.totalUnknown;
  const fallbackPending=mergedClasses(data).reduce((sum,cls)=>sum+(cls.students||[]).filter(isPendingRecording).length,0);
  const pending=Number.isFinite(Number(serverPending))?Number(serverPending):fallbackPending;
  $('m-pending').textContent=pending;
  $('m-pending-label').textContent=data.deadlinePassed?'미제출':'미확인';
  const closure=data.closure||{},notice=data.notice||{},banner=$('notice-banner');
  if(closure.closed){
    banner.className='notice-banner exemption';
    $('notice-title').textContent='학원 방학·휴원 · 녹음 면제';
    $('notice-detail').textContent=(data.exemptReason||'선택 날짜는 수업과 녹음 확인 대상이 아닙니다.')+' 미제출로 집계하지 않습니다.';
    $('deadline-badge').textContent='녹음 면제';
  }else if(!target&&exemptions){
    banner.className='notice-banner exemption';
    $('notice-title').textContent='전원 예정결석·면제';
    $('notice-detail').textContent='면제 학생은 체크·미제출 공지·운영센터 녹음 X 대상에서 제외됩니다.';
    $('deadline-badge').textContent=`면제 ${exemptions}명`;
  }else if(!target){
    banner.className='notice-banner neutral';
    $('notice-title').textContent='녹음 대상 없음';
    $('notice-detail').textContent=data.exemptReason||'선택 날짜에는 대상이 없습니다.';
    $('deadline-badge').textContent='대상 없음';
  }else{
    $('deadline-badge').textContent=data.deadlinePassed?'15시 마감 완료':`마감 ${String(data.deadlineAt||'').slice(11)||'-'}`;
    const partial=closure.partial?` · 휴원 ${numberOr(closure.count)}개 반은 자동 면제됩니다.`:'';
    if(notice.complete){banner.className='notice-banner complete';$('notice-title').textContent='전원 제출 완료';$('notice-detail').textContent=(notice.active?'학생웹앱과 운영센터에 완료 공지가 노출 중입니다.':`완료 공지는 ${data.noticeStartAt}부터 ${data.noticeEndAt}까지 노출됩니다.`)+partial}
    else if(notice.active){banner.className='notice-banner missing';$('notice-title').textContent=`미제출·미확인 ${numberOr(notice.missing,pending)}명`;$('notice-detail').textContent='체크 저장 성공 시 공지 명단에서 즉시 제외됩니다.'+partial}
    else{banner.className='notice-banner future';$('notice-title').textContent=`확인 대기 ${numberOr(notice.missing,pending)}명`;$('notice-detail').textContent=`공지는 ${data.noticeStartAt}부터 노출됩니다.${partial}`}
  }
}

function filteredStudents(cls){return classDisplayStudents(cls).filter(st=>(!APP.filters.hideExemptions||!isRecordingExempt(st))&&(!APP.filters.pendingOnly||isPendingRecording(st)))}
function toggleRecordingFilter(key,checked){APP.filters[key]=Boolean(checked);if(APP.data)renderClasses(APP.data)}
function renderClasses(data){
  const root=$('classes'),empty=$('empty'),visible=mergedClasses(data).map(cls=>({cls,students:filteredStudents(cls)})).filter(item=>item.students.length);
  root.innerHTML=visible.map(item=>renderClass(item.cls,item.students)).join('');
  empty.hidden=visible.length>0;
  if(!visible.length){
    if(APP.filters.pendingOnly)empty.textContent='현재 필터에 해당하는 미확인·미제출 학생이 없습니다.';
    else if(APP.filters.hideExemptions&&totalExemptionCount(data))empty.textContent=`예정결석·면제 ${totalExemptionCount(data)}명은 기본 숨김입니다. 위 필터를 해제하면 확인할 수 있습니다.`;
    else empty.textContent='선택 날짜에는 표시할 녹음 대상이 없습니다.';
  }
}
function renderClass(cls,students=filteredStudents(cls)){const eligible=students.filter(st=>!isRecordingExempt(st)),received=eligible.filter(st=>st.status==='RECEIVED').length,exemptions=students.length-eligible.length,openInfo=eligible.length&&!cls.canCheck?`<div class="open-info">확인 가능: ${esc(cls.openLabel)}</div>`:'';return `<section class="class-card"><div class="class-head"><div><h2>${esc(cls.className)}</h2><p>${esc(cls.vocabSummary||'단어범위 확인 필요')}</p>${openInfo}</div><div class="count"><b>${received}/${eligible.length}</b><span>제출${exemptions?` · 면제 ${exemptions}`:''}</span></div></div><div class="student-list">${students.map(st=>renderStudent(cls,st)).join('')}</div></section>`}
function renderStudent(cls,student){
  const key=`${cls.classId}|${student.studentId}`,received=student.status==='RECEIVED',missing=student.status==='MISSING',exempted=isRecordingExempt(student),disabled=exempted||!student.canCheck||!navigator.onLine;
  const className=['student',received?'received':'',missing?'missing':'',exempted?'exempt':'',disabled&&!received?'locked':''].filter(Boolean).join(' ');
  let state;
  if(exempted){const reason=String(student.exemptReason||'').trim(),period=student.startDate&&student.endDate?` · ${student.startDate}~${student.endDate}`:'';state=`${recordingExemptLabel(student)} · 녹음 확인 제외${reason&&reason!=='예정결석'?` · ${reason}`:''}${period}`}
  else state=received?`제출${student.savedAt?' · '+student.savedAt:''}`:(missing?'미제출 확정':(student.canCheck?'미확인':`${student.openLabel}부터`));
  const override=!exempted&&student.canAcceptBeforeDeadline?`<button class="override-btn" type="button" onclick="acceptBeforeDeadline(event,${jsArg(cls.classId)},${jsArg(student.studentId)},${jsArg(student.name)})">마감 전 제출 인정</button>`:'';
  return `<label class="${className}" data-key="${esc(key)}"><input type="checkbox" ${received?'checked':''} ${disabled?'disabled':''} onchange="saveOne(this,${jsArg(cls.classId)},${jsArg(student.studentId)})"><div class="student-main"><div class="name-line"><span class="name">${esc(student.name)}</span>${exempted?`<span class="badge exemption">${esc(recordingExemptLabel(student))}</span>`:''}</div><span class="state">${esc(state)}</span></div>${override}</label>`;
}
function findStudent(classId,studentId){for(const cls of mergedClasses(APP.data)){if(String(cls.classId)===String(classId))return classDisplayStudents(cls).find(st=>String(st.studentId)===String(studentId))||null}return null}
function recalcLocalClasses(){for(const cls of APP.data?.classes||[]){const eligible=(cls.students||[]).filter(st=>!isRecordingExempt(st));cls.receivedCount=eligible.filter(st=>st.status==='RECEIVED').length;cls.missingCount=eligible.filter(st=>st.status==='MISSING').length;cls.unknownCount=eligible.filter(st=>st.status==='UNKNOWN').length}}
function applySummary(summary,notice){if(!APP.data||!summary)return;APP.data.totalStudents=summary.total;APP.data.totalReceived=summary.received;if(APP.data.deadlinePassed)APP.data.totalMissing=summary.missing;else APP.data.totalUnknown=summary.missing;APP.data.notice=notice||summary.notice;recalcLocalClasses();renderSummary(APP.data);renderClasses(APP.data)}

async function saveOne(input,classId,studentId){
  const key=`${classId}|${studentId}`;
  if(APP.saving.has(key)){input.checked=!input.checked;return}
  const student=findStudent(classId,studentId),desired=input.checked;
  if(!student){input.checked=!desired;return}
  if(isRecordingExempt(student)){input.checked=Boolean(student.received);input.disabled=true;toast(`${student.name} 학생은 ${recordingExemptLabel(student)} 대상이라 저장하지 않았습니다.`);return}
  if(!student.canCheck||!navigator.onLine){input.checked=Boolean(student.received);toast(!navigator.onLine?'오프라인에서는 저장할 수 없습니다.':'아직 녹음 확인 시간이 아닙니다.');return}
  const row=input.closest('.student'),state=row.querySelector('.state');APP.saving.add(key);input.disabled=true;row.classList.add('pending');state.textContent='서버 저장 중…';setSync('1명 저장 중','saving');
  try{const result=await api('opsSaveOne',{targetDate:APP.targetDate,classId,studentId,received:desired});student.status=result.status;student.received=result.received;student.savedAt=result.received?result.savedAt:'';row.classList.toggle('received',result.received);row.classList.toggle('missing',false);state.textContent=result.received?`제출 · ${result.savedAt}`:'미확인';applySummary(result.summary,result.notice);setSync('저장 완료','');toast(`${student.name} 저장 완료`)}
  catch(error){input.checked=!desired;row.classList.add('error');state.textContent='저장 실패 · 화면 상태 미확정';setSync('저장 실패','error');toast(error.message)}
  finally{row.classList.remove('pending');APP.saving.delete(key);input.disabled=isRecordingExempt(student)||!student.canCheck||!navigator.onLine}
}
async function acceptBeforeDeadline(event,classId,studentId,name){event.preventDefault();event.stopPropagation();const student=findStudent(classId,studentId);if(!student||isRecordingExempt(student)){toast(`${name} 학생은 녹음 확인 대상이 아닙니다.`);return}if(!confirm(`${name} 학생이 15시 전에 실제 제출한 것을 확인했습니까?\n이 작업은 마감 후 예외 인정으로 기록됩니다.`))return;const button=event.currentTarget;button.disabled=true;setSync('예외 인정 저장 중','saving');try{const result=await api('opsAcceptBeforeDeadline',{targetDate:APP.targetDate,classId,studentId});toast(`${name} 마감 전 제출 인정 완료`);applySummary(result.summary,result.notice);await loadData(true,APP.targetDate)}catch(error){setSync('저장 실패','error');toast(error.message);button.disabled=false}}
async function readServerAgain(){setSync('다시 읽는 중','saving');await loadData(true,APP.targetDate);toast('CoreDB 상태를 다시 확인했습니다.')}
async function runAudit(){const out=$('audit-result');out.textContent='진단 중…';try{const result=await api('opsAuditDate',{targetDate:APP.targetDate});out.textContent=JSON.stringify(result,null,2)}catch(error){out.textContent='진단 실패: '+error.message}}

globalThis.__ALLBARUN_RECORDING_TEST__={isRecordingExempt,recordingExemptLabel,isPendingRecording,mergedClasses,filteredStudents,plannedAbsenceCount,totalExemptionCount,renderStudent,renderSummary};
window.addEventListener('online',()=>{updateNetwork();loadData(true,APP.targetDate)});
window.addEventListener('offline',updateNetwork);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-APP.lastLoaded>180000)loadData(false,APP.targetDate)});
if('serviceWorker'in navigator){navigator.serviceWorker.register('sw.js').then(reg=>reg.update()).catch(()=>{})}
updateNetwork();
if(ensureConnected())loadData(false);
