'use strict';
const APP={version:'8.2.20',apiKey:'allbarun.rec.apiUrl',tokenKey:'allbarun.rec.token',cacheKey:'allbarun.rec.dashboardCache.v2',targetDate:'',data:null,loading:false,saving:new Set(),lastLoaded:0};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function toast(message){const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600)}
function setSync(text,kind=''){const node=$('sync-state');node.textContent=text;node.className='pill '+kind}
function apiUrl(){return localStorage.getItem(APP.apiKey)||''}
function token(){return localStorage.getItem(APP.tokenKey)||''}
function dashboardCache(){
 try{const cached=JSON.parse(sessionStorage.getItem(APP.cacheKey)||'null');if(!cached||cached.apiUrl!==apiUrl()||cached.session!==token().split('.')[0]||!cached.data||!cached.savedAt||Date.now()-cached.savedAt>180000)return null;return cached}catch(_){return null}
}
function clearDashboardCache(){try{sessionStorage.removeItem(APP.cacheKey)}catch(_){}}
function saveDashboardCache(data){
 try{sessionStorage.setItem(APP.cacheKey,JSON.stringify({apiUrl:apiUrl(),session:token().split('.')[0],savedAt:Date.now(),data}))}catch(_){}
}
function restoreDashboardCache(){
 const cached=dashboardCache();if(!cached)return false;
 APP.data=cached.data;APP.targetDate=cached.data.targetDate||'';APP.lastLoaded=cached.savedAt;APP.preview=true;
 render(cached.data);
 const ageMinutes=Math.max(0,Math.round((Date.now()-cached.savedAt)/60000));
 setSync('최근 화면 · 최신값 확인 중','saving');
 const timing=$('read-timing');if(timing)timing.textContent=`최근 확인 화면을 즉시 표시했습니다. · ${ageMinutes}분 전\n서버 최신값을 뒤에서 확인 중입니다.`;
 return true;
}
function requestId(prefix='REC'){return`${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`}
function isWriteAction(action){return /^(?:opsSaveOne|opsSaveBatch|opsAcceptBeforeDeadline|opsPublishDate|setClassEnabled|quickSaveAbsence|quickSaveScore|quickRegisterSchoolExam)$/.test(String(action||''))}
function isSessionError(message){return /로그인이 필요|세션이 (?:만료|유효하지)|다시 로그인/.test(String(message||''))}
function resetSetupCopy(){const title=$('setup-title'),note=$('setup-note');if(title)title.textContent='녹음체크 서버 연결';if(note)note.textContent='Apps Script 웹앱 실행 주소와 관리자 PIN을 입력하세요. 기존 주소는 그대로 사용합니다.'}
function requireSessionLogin(message){clearDashboardCache();APP.readEpoch=(APP.readEpoch||0)+1;APP.preview=true;$('classes').innerHTML='';APP.data=null;resetWorkspaceReads();localStorage.removeItem(APP.tokenKey);const url=$('api-url'),pin=$('admin-pin'),modal=$('setup-modal'),title=$('setup-title'),note=$('setup-note');if(url)url.value=apiUrl();if(pin)pin.value='';if(title)title.textContent='세션 만료 · 다시 로그인';if(note)note.textContent='서버 주소는 유지했습니다. 기존 관리자 PIN을 입력하면 바로 다시 연결됩니다.';if(modal)modal.classList.add('show');setSync('로그인 필요','error');const error=new Error(message||'세션이 만료되었습니다. 다시 로그인하세요.');error.authRequired=true;return error}
async function api(action,payload={},override={}){const url=override.url||apiUrl();if(!url)throw new Error('서버 주소가 설정되지 않았습니다.');if(!navigator.onLine)throw new Error('인터넷 연결이 없어 서버에 연결할 수 없습니다.');const write=isWriteAction(action),id=override.requestId||payload.requestId||(write?requestId():''),safePayload=id?{...payload,requestId:id}:payload,body={action,payload:safePayload,token:override.token===undefined?token():override.token,pin:override.pin||''},timeoutMs=Number(override.timeoutMs||(write?45000:45000)),controller=new AbortController();let slow=false;const slowTimer=setTimeout(()=>{slow=true;override.onSlow?.()},12000),timer=setTimeout(()=>controller.abort(),timeoutMs);let definitive=false;try{const response=await fetch(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});const text=await response.text();let json;try{json=JSON.parse(text)}catch(_){throw new Error('서버 응답을 읽지 못했습니다. 배포 주소와 권한을 확인하세요.')}definitive=true;if(!json.success){const message=json.error?.message||'요청에 실패했습니다.';if(action!=='login'&&isSessionError(message))throw requireSessionLogin(message);throw new Error(message)}return json.data}catch(error){if(error?.name==='AbortError'){const delayed=new Error(`서버 응답이 ${Math.round(timeoutMs/1000)}초를 넘었습니다. ${write?'저장 성공 여부를 자동으로 다시 확인합니다.':'기존 화면은 유지합니다.'}`);delayed.uncertain=write;delayed.requestId=id;throw delayed}if(write&&!definitive)error.uncertain=true;throw error}finally{clearTimeout(timer);clearTimeout(slowTimer);if(slow)override.onRecovered?.()}}
function updateNetwork(){const online=navigator.onLine,node=$('network-state');node.textContent=online?'온라인':'오프라인';node.className='pill '+(online?'':'offline');document.querySelectorAll('input[type=checkbox],.override-btn').forEach(el=>{if(!online)el.disabled=true})}
function ensureConnected(){if(!apiUrl()||!token()){$('api-url').value=apiUrl();$('setup-modal').classList.add('show');return false}$('setup-modal').classList.remove('show');return true}
async function connectServer(){if(APP.loading||APP.saving.size){toast('진행 중인 작업이 끝난 뒤 연결을 변경하세요.');return}const url=$('api-url').value.trim(),pin=$('admin-pin').value.trim();if(!url||!pin){toast('주소와 PIN을 입력하세요.');return}setSync('연결 중','saving');try{const login=await api('login',{}, {url,pin,token:''});clearDashboardCache();APP.readEpoch=(APP.readEpoch||0)+1;resetWorkspaceReads();APP.preview=true;APP.data=null;$('classes').innerHTML='';localStorage.setItem(APP.apiKey,url);localStorage.setItem(APP.tokenKey,login.token);$('admin-pin').value='';$('setup-modal').classList.remove('show');resetSetupCopy();toast('연결했습니다.');APP.targetDate='';await loadData(false);void loadSelectedWorkspace()}catch(error){setSync('연결 오류','error');toast(error.message)}}
function closeSetupIfConnected(){if(apiUrl()&&token())$('setup-modal').classList.remove('show')}
function openConnectionSettings(){closeSettings();resetSetupCopy();$('api-url').value=apiUrl();$('admin-pin').value='';$('setup-modal').classList.add('show')}
function openSettings(){$('settings-modal').classList.add('show')}
function closeSettings(){$('settings-modal').classList.remove('show')}
function renderReadTiming(data,elapsedMs,error){
 const node=$('read-timing');if(!node)return;
 const ms=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?`${Math.round(value)} ms`:'미제공';
 const timing=data?.serverTiming;
 const lines=[`브라우저 대기: ${ms(elapsedMs)}`,error?'결과: 조회 실패 (서버 단계 시간 미확인)':'결과: 조회 성공'];
 if(!error)lines.push(data?.projectionReadModel===true?'조회 방식: 전용 묶음 조회':data?.projectionFallbackReason?'조회 방식: 기존 조회 · 복귀 사유 '+String(data.projectionFallbackReason):'조회 방식: 기존 조회');
 if(!error&&timing){
  lines.push('아래 수치는 응답 생성 시점의 서버 측정값입니다. 캐시 응답이면 이번 요청 처리 시간이 아닙니다.',`서버 합계: ${ms(timing.totalMs)}`,`후보 날짜: ${ms(timing.candidateMs)}`,`대상 범위: ${ms(timing.targetSnapshotMs)}`,`제출 조회: ${ms(timing.checksMs)}`,`화면 자료 조합: ${ms(timing.assembleMs)}`,`보정 처리: ${ms(timing.catchUpMs)}`,`후보 캐시: ${timing.candidateCacheHit===true?'사용':timing.candidateCacheHit===false?'미사용':'미제공'}`);
  const prefetch=timing.candidatePrefetchTiming;
  if(prefetch?.scope==='REQUEST_CANDIDATE_BUILD'){
   const calls=Number.isSafeInteger(prefetch.calls)&&prefetch.calls>=0?prefetch.calls:'미제공';
   lines.push(`후보 생성 구간: 요청 내 ${calls}회 누적 (스냅샷 측정과 겹치므로 합산하지 않습니다.)`);
   if(calls===0)lines.push('후보 생성 미실행 · 캐시 응답 또는 측정 미실행');
   else for(const [key,label] of [['dateDiscovery','후보 날짜 발견'],['planPrefetch','계획 행 선조회'],['batchPrefetch','녹음 배치 행 선조회'],['snapshotAssembly','후보 스냅샷 조립']])lines.push(`${label}: ${ms(prefetch.milliseconds?.[key])}`);
  }
  const stages=timing.snapshotStageTiming;
  if(stages?.scope==='REQUEST_UNCACHED_SNAPSHOTS'){
   const calls=Number.isSafeInteger(stages.calls)&&stages.calls>=0?stages.calls:'미제공';
   lines.push(`대상 계산 구간: 요청 내 비캐시 계산 ${calls}회 누적 (선택 날짜 단독 시간이 아닙니다.)`);
   for(const [key,label] of [['inputs','기본 자료·계획 조회'],['plans','반·계획 대상 판정'],['eligibility','학생·결석·배정 구성'],['roster','교재 자료 조회'],['bookIndexes','반·이전 수업·정렬 구성'],['classAssembly','면제·휴원 결과 조합']])lines.push(`${label}: ${ms(stages.milliseconds?.[key])}`);
  }
 }
 node.textContent=lines.join('\n');
}
function invalidateRecordingRead(){APP.readEpoch=(APP.readEpoch||0)+1;APP.needsRead=true;APP.refreshPending=true;clearDashboardCache();}
async function loadData(force=false,targetDate=APP.targetDate,verifyPending=false){if(!ensureConnected()||APP.loading||(APP.saving.size&&!(verifyPending&&APP.saving.size===1)))return null;APP.loading=true;APP.loadingTargetDate=targetDate;let readVerified=false;force=force||pendingRecordingChecks().length>0;const readEpoch=APP.readEpoch||0;const readStarted=performance.now();setSync('서버 확인 중','saving');try{const data=await api('opsDashboard',{targetDate,force,readOnly:true,readOnlyCandidateCache:true},{onSlow:()=>{if(readEpoch===(APP.readEpoch||0)&&!APP.saving.size)setSync('조회 지연 · 기존 화면 유지','error')}});if(readEpoch!==(APP.readEpoch||0))return null;if(!data||!/^\d{4}-\d{2}-\d{2}$/.test(data.targetDate)||(targetDate&&data.targetDate!==targetDate))throw new Error('요청한 날짜와 응답 날짜가 다릅니다. 기존 화면을 유지합니다.');readVerified=true;APP.preview=false;APP.needsRead=false;APP.data=data;APP.targetDate=data.targetDate;APP.lastLoaded=Date.now();render(data);if(typeof saveDashboardCache==='function')saveDashboardCache(data);renderReadTiming(data,performance.now()-readStarted,false);setSync('저장 준비','');return data}catch(error){if(readEpoch!==(APP.readEpoch||0)&&!error.authRequired)return null;renderReadTiming(null,performance.now()-readStarted,true);if(error.authRequired){toast('세션이 만료되었습니다. 기존 PIN으로 다시 로그인하세요.')}else if(APP.data){setSync('조회 지연 · 기존 화면 유지','error');toast(error.message)}else{renderError(error);setSync('오류','error')}return null}finally{APP.loading=false;delete APP.loadingTargetDate;updateNetwork();renderRecordingRecovery();if(readVerified)void recoverRecordingChecks();if(APP.refreshPending&&!APP.saving.size&&!APP.accepting&&typeof refreshRecording==='function')void refreshRecording()}}
function renderError(error){const banner=$('notice-banner');banner.className='notice-banner error';$('notice-title').textContent='불러오기 실패';$('notice-detail').textContent=error.message;$('classes').innerHTML='';$('empty').hidden=false;$('empty').textContent='서버 데이터를 확인하지 못했습니다. 설정에서 연결 상태를 확인하세요.'}
function render(data){renderDates(data.candidates||[],data.targetDate,data.totalStudents);renderSummary(data);renderClasses(data.classes||[]);$('now-label').textContent=`${data.targetLabel} · 서버 ${data.lastAuthoritativeReadAt}`;$('authoritative-read').textContent=`최근 동기화 ${data.lastAuthoritativeReadAt}`;renderRecordingRecovery()}
function renderDates(items,targetDate,totalStudents){$('date-strip').innerHTML=items.map(item=>{const count=item.date===targetDate&&Number.isSafeInteger(totalStudents)&&totalStudents>=0?totalStudents:item.studentCount;return `<button type="button" class="date-chip ${item.date===APP.targetDate?'active':''}" onclick="selectDate('${esc(item.date)}')">${esc(item.shortLabel)}<span class="tiny">${count}명</span></button>`}).join('')}
async function selectDate(date){if(APP.loading||APP.saving.size||date===APP.targetDate)return;await loadData(false,date)}
function renderSummary(data){$('m-total').textContent=data.totalStudents;$('m-received').textContent=data.totalReceived;const pending=data.deadlinePassed?data.totalMissing:data.totalUnknown;$('m-pending').textContent=pending;$('m-pending-label').textContent=data.deadlinePassed?'미제출':'미확인';$('deadline-badge').textContent=data.deadlinePassed?'15시 마감 완료':`마감 ${data.deadlineAt.slice(11)}`;const notice=data.notice||{};const banner=$('notice-banner');if(!data.totalStudents){banner.className='notice-banner neutral';$('notice-title').textContent='녹음 대상 없음';$('notice-detail').textContent=data.exemptReason||'선택 날짜에는 대상이 없습니다.'}else if(notice.complete){banner.className='notice-banner complete';$('notice-title').textContent='전원 제출 완료';$('notice-detail').textContent=notice.active?'학생웹앱과 운영센터에 완료 공지가 노출 중입니다.':`완료 공지는 ${data.noticeStartAt}부터 ${data.noticeEndAt}까지 노출됩니다.`}else if(notice.active){banner.className='notice-banner missing';$('notice-title').textContent=`미제출·미확인 ${notice.missing}명`;$('notice-detail').textContent='체크 저장 성공 시 공지 명단에서 즉시 제외됩니다.'}else{banner.className='notice-banner future';$('notice-title').textContent=`확인 대기 ${notice.missing}명`;$('notice-detail').textContent=`공지는 ${data.noticeStartAt}부터 노출됩니다.`}}
function renderClasses(classes){const root=$('classes'),empty=$('empty');root.innerHTML=classes.map(cls=>renderClass(cls,APP.preview)).join('');empty.hidden=classes.length>0;if(!classes.length)empty.textContent='선택 날짜에는 표시할 녹음 대상이 없습니다.'}
function recordingClassScopeLabel(cls){const students=cls.students||[],scoped=students.filter(st=>Object.prototype.hasOwnProperty.call(st,'scopeSource')).length;return scoped?(scoped===students.length?'학생별 확정 범위는 아래에서 확인하세요':'일부 학생 범위 확인 필요'):(cls.vocabSummary||'단어범위 확인 필요')}
function renderClass(cls,preview=false){return `<section class="class-card" data-class-id="${esc(cls.classId)}"><div class="class-head"><div><h2>${esc(cls.className)}</h2><p>${esc(recordingClassScopeLabel(cls))}</p>${cls.canCheck?'':`<div class="open-info">확인 가능: ${esc(cls.openLabel)}</div>`}</div><div class="count">${cls.receivedCount}/${cls.students.length}</div></div><div class="student-list">${cls.students.map(st=>renderStudent(cls,st,preview)).join('')}</div></section>`}
function renderStudentScope(student){if(!Object.prototype.hasOwnProperty.call(student,'scopeSource'))return '';const source=student.scopeSource,label=source==='SAVED'?'저장 당시 범위':source==='CURRENT'?'현재 확정 범위':'범위 확인 필요';const text=String(student.vocabSummary||'').trim();return `<span class="student-scope"><span class="scope-label">${esc(label)}</span> · ${esc(text||(source==='CURRENT'?'확정 단어 범위 없음':'범위 확인 필요'))}</span>`}
function renderStudent(cls,student,preview=false){const key=`${cls.classId}|${student.studentId}`,received=student.status==='RECEIVED',missing=student.status==='MISSING',disabled=preview||!student.canCheck||!navigator.onLine;const className=['student',received?'received':'',missing?'missing':'',disabled&&!received?'locked':''].filter(Boolean).join(' ');const state=received?`제출${student.savedAt?' · '+student.savedAt:''}`:(missing?'미제출 확정':(student.canCheck?'미확인':`${student.openLabel}부터`));const override=!preview&&student.canAcceptBeforeDeadline?`<button class="override-btn" type="button" onclick="acceptBeforeDeadline(event,'${esc(cls.classId)}','${esc(student.studentId)}','${esc(student.name)}')">마감 전 제출 인정</button>`:'';return `<label class="${className}" data-key="${esc(key)}"><input type="checkbox" ${received?'checked':''} ${disabled?'disabled':''} onchange="saveOne(this,'${esc(cls.classId)}','${esc(student.studentId)}')"><div class="student-main"><div class="name-line"><span class="name">${esc(student.name)}</span>${student.plannedAbsence?'<span class="badge absence">예정결석</span>':''}</div>${renderStudentScope(student)}<span class="state">${esc(state)}</span></div>${override}</label>`}
function findStudent(classId,studentId){for(const cls of APP.data?.classes||[]){if(cls.classId===classId)return cls.students.find(st=>st.studentId===studentId)}return null}
function recalcLocalClasses(){for(const cls of APP.data?.classes||[]){cls.receivedCount=cls.students.filter(st=>st.status==='RECEIVED').length;cls.missingCount=cls.students.filter(st=>st.status==='MISSING').length;cls.unknownCount=cls.students.filter(st=>st.status==='UNKNOWN').length}}
function renderClassCounts(){const classes=new Map((APP.data?.classes||[]).map(cls=>[String(cls.classId),cls]));document.querySelectorAll('.class-card[data-class-id]').forEach(card=>{const cls=classes.get(card.dataset.classId),count=card.querySelector('.count');if(cls&&count)count.textContent=`${cls.receivedCount}/${cls.students.length}`})}
function applySummary(summary,notice){if(!APP.data)return;APP.data.totalStudents=summary.total;APP.data.totalReceived=summary.received;if(APP.data.deadlinePassed)APP.data.totalMissing=summary.missing;else APP.data.totalUnknown=summary.missing;APP.data.notice=notice||summary.notice;recalcLocalClasses();renderSummary(APP.data);renderClassCounts()}
async function verifyUncertainSave(classId,studentId,desired,name){setSync('저장 결과 다시 확인 중','saving');const data=await loadData(true,APP.targetDate,true),current=findStudent(classId,studentId),confirmed=!!data&&current&&current.received===desired;if(confirmed){setSync('저장 확인 완료','');toast(`${name} 저장을 CoreDB에서 확인했습니다.`)}else{setSync('저장 확인 필요','error');toast(`${name} 저장 상태를 확인하지 못했습니다. 화면의 다시 읽기를 눌러 확인하세요.`)}return confirmed}
function applySavedStudentScope(row,student,result){if(!Object.prototype.hasOwnProperty.call(result,'scope'))return;const s=result.scope,valid=s&&['SAVED','SAVED_UNRESOLVED'].includes(s.scopeSource)&&typeof s.vocabSummary==='string'&&Array.isArray(s.testPlanIds)&&s.testPlanIds.every(id=>typeof id==='string'&&id.trim());Object.assign(student,valid?{scopeSource:s.scopeSource,vocabSummary:s.vocabSummary,testPlanIds:s.testPlanIds.slice()}:{scopeSource:'SAVED_UNRESOLVED',vocabSummary:'',testPlanIds:[]});const existing=row.querySelector('.student-scope'),html=renderStudentScope(student);if(existing)existing.outerHTML=html;else row.querySelector('.student-main')?.insertAdjacentHTML('beforeend',html)}
// One key per attempt avoids one tab overwriting another tab's pending checks.
function createRecordingJournal(storage){
 const prefix='allbarun.rec.pending.v1.';
 function valid(a){return a&&a.v===1&&typeof a.apiUrl==='string'&&/^https:\/\//.test(a.apiUrl)&&a.apiUrl.length<2048&&typeof a.session==='string'&&a.session.length>0&&a.session.length<4096&&/^REC_SAVE_[A-Za-z0-9_-]{1,120}$/.test(a.requestId)&&/^\d{4}-\d{2}-\d{2}$/.test(a.targetDate)&&['classId','studentId'].every(k=>typeof a[k]==='string'&&a[k].length>0&&a[k].length<200)&&typeof a.received==='boolean'&&(a.expectedRevision===null||typeof a.expectedRevision==='string'&&a.expectedRevision.length<1000)&&Number.isFinite(a.createdAt)&&['QUEUED','SENT','REVIEW'].includes(a.state)}
 function list(url){const items=[];let damaged=0;for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;try{const a=JSON.parse(storage.getItem(key));if(!valid(a)||key!==prefix+a.requestId){damaged++;continue}if(!url||a.apiUrl===url)items.push(a)}catch(_){damaged++}}return{items:items.sort((a,b)=>a.createdAt-b.createdAt||a.requestId.localeCompare(b.requestId)),damaged}}
 function put(a){if(!valid(a))throw new Error('보관 정보 오류');const text=JSON.stringify(a);storage.setItem(prefix+a.requestId,text);if(storage.getItem(prefix+a.requestId)!==text)throw new Error('보관 확인 실패');return a}
 function remove(a){storage.removeItem(prefix+a.requestId);if(storage.getItem(prefix+a.requestId)!==null)throw new Error('보관 취소 확인 실패')}
 return{list,put,remove};
}
function recordingJournal(){return createRecordingJournal(localStorage)}
function recordingSession(){return token().split('.')[0]}
function pendingRecordingChecks(){try{return apiUrl()?recordingJournal().list(apiUrl()).items:[]}catch(_){return[]}}
function classifyRecordingAttempt(a,scope,date,student,blocked=false){
 if(blocked||a.apiUrl!==scope.apiUrl||a.targetDate!==date||!student)return'WAIT';
 if(student.received===a.received)return'CONFIRMED';
 if(a.session!==scope.session||a.state==='REVIEW'||!student.canCheck||student.plannedAbsence||typeof a.expectedRevision!=='string'||student.revision!==a.expectedRevision)return'REVIEW';
 return'RETRY';
}
function retainedRecordingCheck(classId,studentId,date=APP.targetDate){return pendingRecordingChecks().some(a=>a.targetDate===date&&a.classId===classId&&a.studentId===studentId)}
function retainRecordingAttempt(a,state){try{recordingJournal().put({...a,state})}catch(_){toast('체크 보관 정보를 갱신하지 못했습니다. 화면을 닫기 전에 서버 상태를 확인하세요.')}}
function removeRecordingAttempt(a){try{recordingJournal().remove(a);return true}catch(_){toast('저장은 확인했지만 기기의 보관 정보를 정리하지 못했습니다.');return false}}
function renderRecordingRecovery(){
 const panel=$('recording-recovery');if(!panel)return;
 if(!apiUrl()){panel.hidden=true;return}
 let journal;try{journal=recordingJournal().list(apiUrl())}catch(_){panel.hidden=false;panel.textContent='이 기기에 체크를 보관할 수 없습니다. 브라우저 저장 설정을 확인하세요.';return}
 // Active writes already show their state beside the student; keep their durable records without expanding recovery UI.
 journal={...journal,items:journal.items.filter(a=>a.state==='REVIEW'||APP.preview||APP.needsRead||a.targetDate!==APP.targetDate||!APP.saving.has(`${a.classId}|${a.studentId}`)||a.apiUrl!==apiUrl()||a.session!==recordingSession())};
 panel.replaceChildren();panel.hidden=!journal.items.length&&!journal.damaged;if(panel.hidden)return;
 const title=document.createElement('b');title.textContent=`이 기기에 보관된 체크 ${journal.items.length}건`;panel.append(title);
 const note=document.createElement('p');note.textContent=APP.preview||APP.loading||APP.needsRead?'서버 상태 확인 후 복구합니다.':APP.saving.size?'전송 대기 중인 체크를 보관했습니다.':'저장된 항목은 자동 정리합니다. 변경된 항목은 아래에서 확인하세요.';panel.append(note);
 if(journal.damaged){const warning=document.createElement('p');warning.textContent='읽을 수 없는 보관 항목이 있습니다. 자동 전송하지 않습니다.';panel.append(warning)}
 for(const a of journal.items){
  const student=a.targetDate===APP.targetDate&&!APP.preview?findStudent(a.classId,a.studentId):null;
  const line=document.createElement('div');line.className='recovery-item';
  const text=document.createElement('span');text.textContent=`${a.targetDate} · ${student?.name||'학생 확인 필요'} · ${a.received?'제출 체크':'체크 해제'} 보관`;line.append(text);
  const busy=APP.loading||APP.preview||APP.needsRead||APP.saving.size||APP.recovering||!navigator.onLine;
  const button=document.createElement('button');button.type='button';button.className='btn secondary';
  button.textContent=a.targetDate!==APP.targetDate?'해당 날짜 확인':'현재 상태 확인 후 다시 저장';button.disabled=Boolean(busy||(a.targetDate===APP.targetDate&&(!student?.canCheck||student?.plannedAbsence)));
  button.addEventListener('click',()=>void reviewRecordingAttempt(a.requestId));line.append(button);
  const discard=document.createElement('button');discard.type='button';discard.className='btn secondary';discard.textContent='보관 취소';discard.disabled=Boolean(busy);discard.addEventListener('click',()=>{if(confirm('이 기기에 보관한 체크를 취소할까요? 서버에 저장된 값은 바뀌지 않습니다.')){removeRecordingAttempt(a);renderRecordingRecovery()}});line.append(discard);panel.append(line);
 }
}
function recordingInput(a){return Array.from(document.querySelectorAll('.student[data-key]')).find(row=>row.dataset.key===`${a.classId}|${a.studentId}`)?.querySelector('input[type=checkbox]')}
async function reviewRecordingAttempt(id){
 if(APP.loading||APP.saving.size||APP.recovering||!navigator.onLine)return;
 const a=pendingRecordingChecks().find(item=>item.requestId===id);if(!a)return;
 const data=await loadData(true,a.targetDate);if(!data||APP.saving.size||APP.recovering)return;
 const retained=pendingRecordingChecks().find(item=>item.requestId===id);if(!retained)return;
 if(pendingRecordingChecks().filter(b=>b.targetDate===a.targetDate&&b.classId===a.classId&&b.studentId===a.studentId).length>1){toast('같은 학생의 보관 항목이 여러 건입니다. 사용할 항목 외에는 보관을 취소하세요.');return}
 const student=findStudent(a.classId,a.studentId),input=recordingInput(a);
 if(!student?.canCheck||student.plannedAbsence||!input){toast('현재 체크할 수 없는 학생입니다. 보관된 체크는 유지합니다.');return}
 if(!confirm(`${student.name} · 서버 ${student.received?'제출':'미확인'} → 보관한 ${a.received?'제출':'미확인'} 상태로 다시 저장할까요?`))return;
 input.checked=a.received;await saveOne(input,a.classId,a.studentId,{replace:retained});
}
async function recoverRecordingChecks(){
 if(APP.recovering||APP.loading||APP.preview||APP.needsRead||APP.saving.size||APP.accepting||document.hidden||!navigator.onLine)return;
 APP.recovering=true;APP.outboxAutoTried??=new Set();
 try{
  const attempts=pendingRecordingChecks(),scope={apiUrl:apiUrl(),session:recordingSession()};
  // Conflicting drafts must not become eligible for automatic replay after one is cleared.
  for(const a of attempts)if(attempts.filter(b=>b.targetDate===a.targetDate&&b.classId===a.classId&&b.studentId===a.studentId).length>1){a.state='REVIEW';retainRecordingAttempt(a,'REVIEW')}
  for(const a of attempts){
   if(APP.needsRead||APP.preview||APP.loading||APP.saving.size)break;
   const student=findStudent(a.classId,a.studentId),decision=classifyRecordingAttempt(a,scope,APP.targetDate,student);
   if(decision==='CONFIRMED'){removeRecordingAttempt(a);continue}
   const duplicates=attempts.filter(b=>b.targetDate===a.targetDate&&b.classId===a.classId&&b.studentId===a.studentId).length;
   if(decision!=='RETRY'||duplicates!==1||APP.outboxAutoTried.has(a.requestId))continue;
   const input=recordingInput(a);if(!input)continue;
   input.checked=a.received;await saveOne(input,a.classId,a.studentId,{retry:a});
   if(!APP.needsRead&&!APP.preview&&classifyRecordingAttempt(a,scope,APP.targetDate,findStudent(a.classId,a.studentId))==='CONFIRMED')removeRecordingAttempt(a);
  }
 }finally{APP.recovering=false;renderRecordingRecovery()}
}

// Serialize network batches while preserving a distinct promise and journal per student.
function createRecordingBatchTransport(send,{delayMs=120,max=30,canSend=()=>true}={}){
 const queue=[];let active=false,timer=null;
 function schedule(){if(!active&&!timer&&queue.length)timer=setTimeout(()=>{timer=null;void flush()},delayMs)}
 async function flush(){
  if(active||!queue.length)return;active=true;
  const date=queue[0].payload.targetDate,jobs=[];
  while(queue.length&&jobs.length<max&&queue[0].payload.targetDate===date)jobs.push(queue.shift());
  try{
   if(!jobs.every(job=>canSend(job.context))){const error=new Error('서버 확인 후 보관된 체크를 복구합니다.');error.deferred=true;throw error}
   const response=await send(date,jobs.map(job=>job.payload),()=>jobs.forEach(job=>job.onSlow?.()));
   const results=response?.results;
   if(!response||response.ok!==true||response.targetDate!==date||!Array.isArray(results)||results.length!==jobs.length)throw new Error('묶음 저장 응답이 요청과 일치하지 않습니다.');
   const map=new Map();
   for(const result of results){if(!result||map.has(result.requestId))throw new Error('중복된 저장 응답입니다.');map.set(result.requestId,result)}
   // Validate the complete envelope before settling any individual write.
   for(const job of jobs){const result=map.get(job.payload.requestId);if(!result||result.targetDate!==date||result.classId!==job.payload.classId||result.studentId!==job.payload.studentId)throw new Error('학생별 저장 응답이 요청과 일치하지 않습니다.')}
   for(const job of jobs){const result=map.get(job.payload.requestId);if(result.error&&!result.conflict){job.reject(new Error(result.error.message||'학생 체크를 저장하지 못했습니다.'))}else job.resolve(result)}
  }catch(error){if(!error.deferred)error.uncertain=true;for(const job of jobs)job.reject(error)}
  finally{active=false;schedule()}
 }
 return (payload,{context,onSlow}={})=>new Promise((resolve,reject)=>{queue.push({payload,context,onSlow,resolve,reject});schedule()});
}
function recordingBatchTransport(){
 if(!APP.batchTransport)APP.batchTransport=createRecordingBatchTransport(
  (targetDate,changes,onSlow)=>{const id=requestId('REC_BATCH');return api('opsSaveBatch',{targetDate,changes,requestId:id},{requestId:id,onSlow})},
  {canSend:context=>!APP.needsRead&&!APP.preview&&context.targetDate===APP.targetDate&&context.apiUrl===apiUrl()&&context.session===recordingSession()}
 );
 return APP.batchTransport;
}

async function saveOne(input,classId,studentId,recovery=null){
 const key=`${classId}|${studentId}`,student=findStudent(classId,studentId);
 if(!student||APP.preview||APP.needsRead||(APP.loading&&APP.loadingTargetDate!==APP.targetDate)||APP.accepting||APP.saving.has(key)){
  input.checked=student?student.received:!input.checked;
  return;
 }
 const desired=input.checked,date=APP.targetDate,id=recovery?.retry?.requestId||requestId('REC_SAVE');
 const expectedRevision=recovery?.retry?.expectedRevision??(typeof student.revision==='string'?student.revision:null);
 const revision=typeof expectedRevision==='string'?{expectedRevision}:{};
 if(!recovery&&retainedRecordingCheck(classId,studentId,date)){input.checked=student.received;toast('보관된 체크를 먼저 확인하세요.');renderRecordingRecovery();return}
 const attempt=recovery?.retry||{v:1,apiUrl:apiUrl(),session:recordingSession(),requestId:id,targetDate:date,classId,studentId,received:desired,expectedRevision,createdAt:Date.now(),state:'QUEUED'};
 try{
  if(recovery?.retry&&classifyRecordingAttempt(attempt,{apiUrl:apiUrl(),session:recordingSession()},date,student)!=='RETRY')throw new Error('복구 조건 변경');
  recordingJournal().put(attempt);
  if(recovery?.replace&&!removeRecordingAttempt(recovery.replace)){recordingJournal().remove(attempt);throw new Error('기존 보관 확인 필요')}
 }catch(_){input.checked=student.received;toast('이 기기에 체크를 보관하지 못해 전송하지 않았습니다. 저장 공간과 브라우저 설정을 확인하세요.');return}
 if(APP.loading){APP.readEpoch=(APP.readEpoch||0)+1;APP.refreshPending=true;}
 const row=input.closest('.student'),state=row.querySelector('.state');
 const before=state.textContent;
 APP.saving.add(key);
 input.disabled=true;
 row.classList.remove('error');
 row.classList.add('pending');
 clearDashboardCache();
 state.textContent='저장 대기 중…';
 setSync('자동 저장 중','saving');
 renderRecordingRecovery();

 const useBatch=!recovery&&Number(APP.data?.recordingBatchLimit)>=1&&typeof expectedRevision==='string';
 const write=async()=>{
  try{
   if(APP.needsRead||APP.preview||APP.targetDate!==date||attempt.apiUrl!==apiUrl()||attempt.session!==recordingSession()){
    const error=new Error('서버 확인 후 보관된 체크를 복구합니다.');error.deferred=true;throw error;
   }
   state.textContent=desired?'제출 · 저장 중':'미확인 · 저장 중';
   recordingJournal().put({...attempt,state:'SENT'});
   (APP.outboxAutoTried??=new Set()).add(id);
   const savePayload={targetDate:date,classId,studentId,received:desired,requestId:id,...revision};
   const result=useBatch?await recordingBatchTransport()(savePayload,{context:attempt,onSlow:()=>{state.textContent='서버 저장 확인 중…'}}):await api('opsSaveOne',savePayload,
    {requestId:id,onSlow:()=>{state.textContent='서버 저장 확인 중…'}});
   if(APP.preview)return;
   if(result?.conflict){const error=new Error('다른 화면에서 이 학생의 체크가 변경되었습니다. 최신 상태를 다시 확인합니다.');error.conflict=true;throw error;}
   if(!result||result.ok===false||result.received!==desired||result.status!==(desired?'RECEIVED':'UNKNOWN')||!result.summary||
      (result.targetDate&&result.targetDate!==date)||(result.classId&&result.classId!==classId)||(result.studentId&&result.studentId!==studentId)){
    const error=new Error('저장 응답이 요청과 일치하지 않아 서버 상태를 다시 확인합니다.');error.uncertain=true;throw error;
   }
   if(recovery?.retry){const error=new Error('복구 저장 결과를 서버에서 다시 확인합니다.');error.uncertain=true;throw error}
   student.status=result.status;
   student.received=result.received;
   if(typeof result.revision==='string')student.revision=result.revision;
   student.savedAt=result.received?result.savedAt:'';
   applySavedStudentScope(row,student,result);
   row.classList.toggle('received',result.received);
   row.classList.toggle('missing',result.status==='MISSING');
   state.textContent=result.received?`제출 · ${result.savedAt}`:result.status==='MISSING'?'미제출':'미확인';
   applySummary(result.summary,result.notice);
   removeRecordingAttempt(attempt);
   if(APP.saving.size===1)setSync('저장 완료','');
  }catch(error){
   retainRecordingAttempt(attempt,error.deferred?'QUEUED':error.uncertain?'SENT':'REVIEW');
   row.classList.add('error');
   input.checked=student.received;
   if(error.uncertain||error.conflict){
    APP.needsRead=true;
    state.textContent=error.conflict?'다른 화면의 변경 확인 중':'저장 결과 미확인';
    setSync('저장 결과 확인 필요','error');
    if(error.conflict)toast(error.message);
   }else if(!error.deferred){
    state.textContent=before;
    setSync(APP.preview?'로그인 필요':'저장 실패','error');
    toast(error.message);
   }
  }finally{
   row.classList.remove('pending');
   APP.saving.delete(key);
   if(input.isConnected)input.disabled=APP.preview||APP.needsRead||!student.canCheck||!navigator.onLine;
   renderRecordingRecovery();
  }
  if(!APP.saving.size&&!APP.recovering)void recoverRecordingChecks();
  if(APP.needsRead&&!APP.saving.size&&!APP.preview){
   const latest=await loadData(true,date);
   if(latest)setSync('서버 상태 재확인 완료','');
  }else if(APP.refreshPending&&!APP.saving.size&&typeof refreshRecording==='function'){
   await refreshRecording();
  }
 };
 if(useBatch)return write();
 const queued=(APP.writeQueue||Promise.resolve()).then(write);
 APP.writeQueue=queued.catch(()=>{});
 return queued;
}

async function acceptBeforeDeadline(event,classId,studentId,name){event.preventDefault();event.stopPropagation();const key=`${classId}|${studentId}`;if(APP.preview||APP.needsRead||APP.loading||APP.saving.size)return;if(!confirm(`${name} 학생이 15시 전에 실제 제출한 것을 확인했습니까?\n이 작업은 마감 후 예외 인정으로 기록됩니다.`))return;const button=event.currentTarget,id=requestId('REC_ACCEPT');APP.saving.add(key);APP.accepting=true;clearDashboardCache();button.disabled=true;setSync('예외 인정 저장 중','saving');try{const result=await api('opsAcceptBeforeDeadline',{targetDate:APP.targetDate,classId,studentId,requestId:id},{requestId:id,onSlow:()=>setSync('예외 인정 확인 중','saving')});toast(`${name} 마감 전 제출 인정 완료`);applySummary(result.summary,result.notice);await loadData(true,APP.targetDate,true)}catch(error){if(error.uncertain){APP.needsRead=true;await verifyUncertainSave(classId,studentId,true,name);}else{setSync('저장 실패','error');toast(error.message);button.disabled=false}}finally{APP.accepting=false;APP.saving.delete(key);if(APP.refreshPending&&typeof refreshRecording==='function')void refreshRecording()}}
async function readServerAgain(){setSync('다시 읽는 중','saving');const data=await loadData(true,APP.targetDate);if(data)toast('CoreDB 상태를 다시 확인했습니다.')}
async function runAudit(){const out=$('audit-result');out.textContent='진단 중…';try{const result=await api('opsAuditDate',{targetDate:APP.targetDate});out.textContent=JSON.stringify(result,null,2)}catch(error){out.textContent='진단 실패: '+error.message}}
// These workspaces use the recording session and read through the existing mobile API.
let selectedWorkspace='recording';
let absenceRead=0,examRead=0,rosterRead=0,registrationRead=0;
function resetWorkspaceReads(){
 absenceRead++;examRead++;rosterRead++;registrationRead++;
 const registration=$('exam-registration');
 if(registration){
  registration.hidden=true;registration.reset?.();
  registration.elements?.group?.replaceChildren?.();
  const status=registration.querySelector?.('[role=status]');if(status)status.textContent='';
 }
 $('open-exam-registration')?.setAttribute?.('aria-expanded','false');
 $('absence-results')?.replaceChildren?.();
 const absenceForm=$('workspace-absence-form');
 if(absenceForm){
  absenceForm.hidden=true;absenceForm.reset?.();
  const status=absenceForm.querySelector?.('[role=status]');if(status)status.textContent='';
 }
 $('workspace-absence-student')?.replaceChildren?.();
 $('score-results')?.replaceChildren?.();
 const picker=$('workspace-exam');if(picker){picker.replaceChildren?.();picker.disabled=true;}
}
function selectWorkspace(name){
 selectedWorkspace=name;
 for(const button of document.querySelectorAll('[data-workspace]')){
  const current=button.dataset.workspace===name;
  button.setAttribute('aria-pressed',String(current));
  button.classList.toggle('primary',current);
  button.classList.toggle('secondary',!current);
  $('workspace-'+button.dataset.workspace).hidden=!current;
 }
 void loadSelectedWorkspace();
}
function loadSelectedWorkspace(){
 if(selectedWorkspace==='absence')return loadWorkspaceAbsences();
 if(selectedWorkspace==='score')return loadWorkspaceExams();
 if(APP.needsRead)return loadData(false,APP.targetDate);
}
function workspaceList(root,rows,describe,empty){
 if(!rows.length){root.textContent=empty;return}
 const list=document.createElement('ul');
 for(const row of rows){
  const item=document.createElement('li');
  item.textContent=describe(row);list.append(item);
 }
 root.replaceChildren(list);
}
const workspaceAttempts=new WeakMap();
async function saveWorkspaceForm(form,action,payload,accept,onSaved){
 if(!ensureConnected()||workspaceAttempts.get(form)?.busy)return;
 const controls=form.querySelector('fieldset'),status=form.querySelector('[role=status]');
 const signature=JSON.stringify(payload),url=apiUrl(),session=token();
 const previous=workspaceAttempts.get(form);
 const id=previous?.signature===signature&&previous.url===url&&previous.session===session?previous.id:requestId('WORKSPACE');
 workspaceAttempts.set(form,{signature,url,session,id,busy:true});
 controls.disabled=true;status.textContent='저장 중';
 try{
  const result=await api(action,payload,{requestId:id});
  if(url!==apiUrl()||session!==token()||!form.isConnected)return;
  if(!accept(result))throw new Error('저장 응답을 확인하지 못했습니다. 목록을 다시 확인하세요.');
  workspaceAttempts.delete(form);status.textContent='저장 완료';
  onSaved(result);
 }catch(error){
  if(url!==apiUrl()||session!==token()||!form.isConnected)return;
  status.textContent=error.uncertain?'응답 시간 초과 · 목록에서 반영 여부를 먼저 확인하세요.':error.message;
 }finally{
  const attempt=workspaceAttempts.get(form);
  if(attempt?.id===id)attempt.busy=false;
  controls.disabled=false;
 }
}
function submitWorkspaceAbsence(event){
 event.preventDefault();
 const form=event.currentTarget,data=new FormData(form);
 const studentId=$('workspace-absence-student').value,startDate=data.get('startDate');
 const endDate=data.get('endDate')||startDate,reason=String(data.get('reason')||'').trim();
 if(!studentId||!startDate||endDate<startDate){
  form.querySelector('[role=status]').textContent='학생과 결석 기간을 확인하세요.';return;
 }
 void saveWorkspaceForm(form,'quickSaveAbsence',{studentId,startDate,endDate,reason},
  result=>Boolean(result?.plannedAbsenceId),result=>{form.reset();if(result.noticeRefreshPending)toast('예정결석 저장 완료 · 녹음 공지 갱신을 확인하세요.');invalidateRecordingRead();void loadWorkspaceAbsences();void refreshRecording()});
}
async function loadWorkspaceAbsences(){
 if(!ensureConnected())return;
 const root=$('absence-results'),read=++absenceRead;
 root.textContent='예정결석 목록을 불러오는 중';
 try{
  const data=await api('quickAbsences');
  if(read!==absenceRead)return;
  const picker=$('workspace-absence-student'),previous=picker.value;
  picker.replaceChildren(new Option('학생 선택',''));
  for(const row of data.students||[])picker.add(new Option([row.name,row.className].filter(Boolean).join(' · '),row.studentId));
  if([...picker.options].some(option=>option.value===previous))picker.value=previous;
  $('workspace-absence-form').hidden=!(data.students||[]).length;
  workspaceList(root,data.rows||[],row=>[row.studentName,row.className,
   row.startDate===row.endDate?row.startDate:row.startDate+' ~ '+row.endDate,
   row.reason].filter(Boolean).join(' · '),'등록된 예정결석이 없습니다.');
 }catch(error){if(read===absenceRead)root.textContent=error.message}
}
async function loadWorkspaceExams(preferredExamId){
 if(!ensureConnected())return;
 const picker=$('workspace-exam'),root=$('score-results'),read=++examRead;
 const previous=typeof preferredExamId==='string'?preferredExamId:picker.value;
 rosterRead++;picker.disabled=true;root.textContent='학교시험 목록을 불러오는 중';
 try{
  const data=await api('quickExamList',previous?{includeExamId:previous}:{});
  if(read!==examRead)return;
  picker.replaceChildren();
  for(const row of data.rows||[]){
   picker.add(new Option(row.name+' · '+row.startDate,row.examId));
  }
  if(!picker.options.length){root.textContent='등록된 학교시험이 없습니다.';return}
  if([...picker.options].some(option=>option.value===previous))picker.value=previous;
  picker.disabled=false;await loadWorkspaceRoster();
 }catch(error){if(read===examRead)root.textContent=error.message}
}
async function loadWorkspaceRoster(){
 const examId=$('workspace-exam').value;
 if(!examId||!ensureConnected())return;
 const root=$('score-results'),read=++rosterRead;
 root.textContent='시험 명단을 불러오는 중';
 try{
  const data=await api('quickExamRoster',{examId});
  if(read!==rosterRead)return;
  renderWorkspaceScores(root,data.rows||[],examId);
 }catch(error){if(read===rosterRead)root.textContent=error.message}
}
function toggleExamRegistration(){
 const form=$('exam-registration'),button=$('open-exam-registration');
 form.hidden=!form.hidden;
 button.setAttribute('aria-expanded',String(!form.hidden));
 if(!form.hidden&&!form.elements.startDate.value){
  form.elements.startDate.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  void loadExamRegistrationOptions();
 }
}
async function loadExamRegistrationOptions(){
 const form=$('exam-registration'),date=form.elements.startDate.value;
 const group=form.elements.group,submit=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');
 const ticket=++registrationRead;
 group.replaceChildren(new Option('학교·학년 선택',''));submit.disabled=true;
 if(!date||!ensureConnected())return;
 status.textContent='대상 학교와 학년을 확인 중';
 try{
  const result=await api('quickExamRegistrationOptions',{startDate:date});
  if(ticket!==registrationRead)return;
  for(const row of result.rows||[]){
   group.add(new Option(row.schoolName+' · '+row.course+row.grade+' · '+row.total+'명',JSON.stringify([row.schoolId,row.course,row.grade])));
  }
  submit.disabled=group.options.length<2;
  status.textContent=submit.disabled?'시험일에 해당하는 재원생이 없습니다.':'';
 }catch(error){if(ticket===registrationRead)status.textContent=error.message}
}
function submitExamRegistration(event){
 event.preventDefault();
 const form=event.currentTarget,data=new FormData(form);
 const group=data.get('group');
 if(!group)return;
 const [schoolId,course,grade]=JSON.parse(group);
 const payload={schoolId,course,grade,startDate:data.get('startDate'),semester:data.get('semester'),examType:data.get('examType')};
 let saved;
 void saveWorkspaceForm(form,'quickRegisterSchoolExam',payload,result=>{
  if(typeof result?.examId!=='string'||!result.examId)return false;
  saved=result;return true;
 },()=>{
  form.querySelector('[role=status]').textContent=saved.existing?'기존 시험을 열었습니다 · '+saved.total+'명':'시험 등록 완료 · '+saved.total+'명';
  void loadWorkspaceExams(saved.examId);
 });
}
function renderWorkspaceScores(root,rows,examId){
 workspaceList(root,rows,row=>{
  const state=row.targetStatus==='ABSENT'?'결시':row.targetStatus==='REVIEW'?'대상 확인 필요':
   row.existing&&row.rawScore!==''&&row.rawScore!=null?String(row.rawScore)+'점':'미입력';
  return [row.name,row.className,state].filter(Boolean).join(' · ');
 },'이 시험에 등록된 학생이 없습니다.');
 if(!rows.length)return;
 rows.forEach((row,index)=>{
  if(row.existing||row.targetStatus!=='TARGET')return;
  const item=root.firstElementChild.children[index],form=document.createElement('form');
  form.innerHTML='<fieldset><label class="field">점수<input name="score" inputmode="decimal" required></label><button class="btn secondary" type="submit">저장</button></fieldset><span role="status"></span>';
  const field=form.elements.score;
  field.setAttribute('aria-label',row.name+' 점수');
  form.addEventListener('submit',event=>{
   event.preventDefault();
   if($('workspace-exam').value!==examId)return;
   const score=field.value.trim(),status=form.querySelector('[role=status]');
   if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(score)||Number(score)>100){
    status.textContent='0~100점, 소수점 둘째 자리까지 입력하세요.';return;
   }
   const payload={examId,studentId:row.studentId,mode:'SCORE',rawScore:Number(score),allowEdit:false};
   void saveWorkspaceForm(form,'quickSaveScore',payload,
    result=>result?.examId===examId&&result.studentId===row.studentId&&result.rawScore!==''&&result.rawScore!=null&&Number(result.rawScore)===payload.rawScore,
    ()=>{item.textContent=[row.name,row.className,score+'점 · 저장 완료'].filter(Boolean).join(' · ')});
  });
  item.append(form);
 });
}
for(const button of document.querySelectorAll('[data-workspace]')){
 button.addEventListener?.('click',()=>selectWorkspace(button.dataset.workspace));
}
$('open-exam-registration')?.addEventListener?.('click',toggleExamRegistration);
const registrationForm=$('exam-registration');
registrationForm?.elements?.startDate?.addEventListener?.('change',loadExamRegistrationOptions);
registrationForm?.addEventListener?.('submit',submitExamRegistration);
$('workspace-absence-form')?.addEventListener?.('submit',submitWorkspaceAbsence);
$('reload-absences')?.addEventListener?.('click',loadWorkspaceAbsences);
$('reload-exams')?.addEventListener?.('click',loadWorkspaceExams);
$('workspace-exam')?.addEventListener?.('change',loadWorkspaceRoster);

function initialRecordingTargetDate(now=Date.now()){
 const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(value));
 return APP.targetDate&&APP.lastLoaded&&day(APP.lastLoaded)===day(now)?APP.targetDate:'';
}

async function refreshRecording(){
 if(document.hidden||!navigator.onLine||!apiUrl()||!token())return;
 if(APP.loading||APP.saving.size||APP.accepting){
  APP.refreshPending=true;
  return;
 }
 APP.refreshPending=false;
 const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(value));
 const crossedDay=APP.lastLoaded&&day(APP.lastLoaded)!==day(Date.now());
 await loadData(Boolean(APP.needsRead),APP.preview||crossedDay?'':APP.targetDate);
}
window.addEventListener('online',()=>{updateNetwork();void refreshRecording()});
window.addEventListener('offline',updateNetwork);
window.addEventListener('pageshow',event=>{if(event.persisted)void refreshRecording()});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)void refreshRecording();
});
if(typeof setInterval==='function')setInterval(()=>{void refreshRecording()},60000);
if('serviceWorker'in navigator){navigator.serviceWorker.register('sw.js').then(reg=>reg.update()).catch(()=>{})}
updateNetwork();if(ensureConnected()){restoreDashboardCache();void loadData(false,initialRecordingTargetDate());}
renderRecordingRecovery();

