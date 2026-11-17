/* Shared, session-only learning workspace. Uses verified assignedPracticeState rows only. */
(function () {
  'use strict';
  const labels = {focus:'집중 카드',challenge:'단계형 챌린지',studio:'시험 준비실'};
  const scopeLabel = s => {const date=String(s.planDate||'');const sources=[...new Set(s.rows.map(r=>String(r[1]||'').trim()).filter(Boolean))];const extra=sources.filter(x=>!date.includes(x));return [date,...extra.slice(0,3),extra.length>3?'외 '+(extra.length-3)+'개 범위':''].filter(Boolean).join(' · ')||'선택한 단어장';};
  const stages = {card:'카드로 익히기',recall:'뜻 골라보기',spell:'직접 써보기'};
  const esc = value => escapeHtml(String(value ?? ''));
  const button = (action,text,kind='secondary',attrs='') => `<button type="button" class="pe-button pe-${kind}" data-pe="${action}" ${attrs}>${text}</button>`;
  function current() { return isAssignedPracticeCurrent() ? assignedPracticeState : null; }
  function workspace(s) {
    if (!s.experience || s.experience.rows !== s.rows) {
      s.experienceBatches ||= new Map();
      const batchKey=s.batchStart||0;
      if(s.experienceBatches.has(batchKey)){s.experience=s.experienceBatches.get(batchKey);s.experience.rows=s.rows;return s.experience;}
      s.experience={rows:s.rows,view:'focus',screen:'overview',stage:'card',page:0,queue:shuffleAssignedPractice(s.rows.map((_,i)=>i)),positions:{card:0,recall:0,spell:0},drafts:new Map(),cards:new Map(),recalls:new Map(),spells:new Map(),revealed:new Set(),round:new Set(),feedback:new Map(),choices:new Map()};
      s.experienceBatches.set(batchKey,s.experience);
      // Cache stable, unambiguous English -> meaning choices once per loaded range.
      const meanings=new Map();s.rows.forEach(r=>{const k=String(r[2]).trim().toLowerCase();if(!meanings.has(k))meanings.set(k,new Set());meanings.get(k).add(String(r[3]).trim());});
      s.rows.forEach((r,i)=>{if(meanings.get(String(r[2]).trim().toLowerCase()).size!==1)return;const other=[...new Set(s.rows.filter(x=>String(x[2]).trim().toLowerCase()!==String(r[2]).trim().toLowerCase()).map(x=>String(x[3]).trim()))].filter(x=>x&&x!==String(r[3]).trim());if(other.length<3)return;const answers=[String(r[3]).trim(),...other.slice(0,3)];const offset=i%4;s.experience.choices.set(i,answers.slice(offset).concat(answers.slice(0,offset)));});
    }
    return s.experience;
  }
  const key=(w,i)=>w.stage+':'+i;
  const weak=(w,i)=>w.cards.get(i)===false||w.recalls.get(i)===false||w.spells.get(i)===false;
  const checked=(w,i)=>w.cards.has(i)||w.recalls.has(i)||w.spells.has(i);
  function index(w){return w.queue[w.positions[w.stage]];}
  function complete(w,i){return w.round.has(key(w,i));}
  function focus(root,selector){requestAnimationFrame(()=>{if(root.isConnected){const desired=root.querySelector(selector);const el=desired&&!desired.disabled?desired:root.querySelector('#pe-answer:not([readonly]), [data-pe="reveal"], [data-pe="choice"]:not(:disabled), [data-pe="advance"], [data-pe="all"], [data-pe="start"]');if(el){el.focus({preventScroll:true});const rect=el.getBoundingClientRect();if(rect.bottom>innerHeight||rect.top<0)el.scrollIntoView({block:'nearest',behavior:'instant'});}}});}
  function list(s,w){const start=w.page*6;return `<ul class="pe-word-list">${s.rows.slice(start,start+6).map((r,n)=>{const i=start+n;return `<li class="${weak(w,i)?'is-weak':checked(w,i)?'is-known':''}"><span>${String(i+1).padStart(2,'0')}</span><button type="button" class="pe-button pe-quiet" data-pe="inspect" data-index="${i}"><strong>${esc(r[2])}</strong> <span>${esc(r[3])}</span></button><small>${[w.cards.has(i)?'카드 '+(w.cards.get(i)?'기억':'헷갈림'):'',w.recalls.has(i)?'뜻 '+(w.recalls.get(i)?'정답':'재확인'):'',w.spells.has(i)?'철자 '+(w.spells.get(i)?'정답':'재확인'):''].filter(Boolean).join(' · ')||'미점검'}</small></li>`;}).join('')}</ul><div class="pe-actions">${button('page-prev','← 이전','quiet',w.page===0?'disabled':'')}<span>${start+1}–${Math.min(start+6,s.rows.length)} / ${s.rows.length}</span>${button('page-next','다음 →','quiet',start+6>=s.rows.length?'disabled':'')}</div>`;}
  function overview(s,w){const done=s.rows.filter((_,i)=>checked(w,i)).length;const difficult=s.rows.filter((_,i)=>weak(w,i)).length;
    const intro={focus:['한 단어씩, 확실하게.','뜻을 떠올린 다음 확인하세요. 헷갈린 단어는 따로 모아둘게요.'],challenge:['아는 단어를, 쓸 수 있는 단어로.','세 단계를 따라 기억을 확인하세요. 원하는 단계부터 시작해도 좋아요.'],studio:['무엇을 더 확인하면 될까요?','같은 시험범위에서 점검할 단어를 골라보세요.']}[w.view];
    return `<div class="pe-layout"><div class="pe-main"><p class="pe-eyebrow">${w.view==='focus'?'ONE WORD AT A TIME':w.view==='challenge'?'STEP BY STEP':'ASSIGNED SCOPE'}</p><h2 class="pe-title">${intro[0]}</h2><p class="pe-description">${intro[1]}</p>${w.view==='focus'?`<div class="pe-card"><div class="pe-topline"><span>ENGLISH → MEANING</span><span>${s.rows.length} WORDS</span></div><div class="pe-word">${esc(s.rows[index(w)]?.[2]||s.rows[0][2])}</div><p class="pe-hint">뜻이 떠오르나요?</p></div>`:w.view==='challenge'?`<div class="pe-panel pe-steps">${Object.entries(stages).map(([stage,label],i)=>button('stage',`<span>0${i+1}</span><strong>${label}</strong><small>${(stage==='card'?w.cards:stage==='recall'?w.recalls:w.spells).size} / ${s.rows.length}</small>`,'secondary',`data-stage="${stage}"`)).join('')}</div>`:`<div class="pe-result-stats"><span>점검한 단어 <strong>${done}/${s.rows.length}</strong></span><span>다시 볼 단어 <strong>${difficult}</strong></span></div>`}<div class="pe-actions">${button('start',w.screen==='overview'&&w.started?'이어서 연습하기 →':`${s.rows.length}단어 바로 연습하기 →`,'primary')}${difficult?button('weak',`다시 볼 ${difficult}단어 연습`):''}</div>${w.view==='studio'?list(s,w):''}</div><aside class="pe-aside">${w.view!=='studio'?'<details class="pe-details"><summary>범위·연습 기록 보기</summary>':''}<p class="pe-eyebrow">이번 연습 범위</p><h3>${esc(scopeLabel(s))}</h3><p>${s.rows.length}단어 · ${s.preview?'관리자·교사 미리보기':s.personal?'선택한 범위':'본인 배정 시험범위'}</p><p class="pe-hint">카드 자기평가 ${w.cards.size}개<br>뜻 선택 확인 ${w.recalls.size}개<br>철자 확인 ${w.spells.size}개</p><p class="pe-hint">${!s.personal&&!s.preview?'본인에게 배정된 시험범위 전체를 불러왔습니다. 큰 범위는 200단어씩 나누어 연습하며 새 연습마다 순서를 섞습니다. ':''}이 화면을 벗어나거나 로그아웃하면 연습 상태가 초기화됩니다.</p>${w.view!=='studio'?'</details>':''}${button('mock','주관식 모의연습','quiet')}</aside></div>`;
  }
  function study(s,w){const i=index(w),row=s.rows[i],pos=w.positions[w.stage],fb=w.feedback.get(key(w,i));
    if(!row)return finish(s,w);
    const choices=w.choices.get(i);
    const input=w.stage==='card'?`<div class="pe-word">${esc(row[2])}</div><div class="pe-meaning" aria-live="polite">${w.revealed.has(i)?esc(row[3]):'뜻을 먼저 떠올려보세요'}</div>${button('reveal',w.revealed.has(i)?'뜻 다시 가리기':'뜻 확인하기','secondary')}${w.revealed.has(i)?`<div class="pe-actions">${button('difficult','아직 헷갈려요','secondary',`aria-pressed="${w.cards.get(i)===false}"`)}${button('known','기억했어요','primary',`aria-pressed="${w.cards.get(i)===true}"`)}</div>`:''}<p class="pe-hint">내가 판단한 기억 상태이며 정답률이 아닙니다.</p>`:w.stage==='recall'&&choices?`<div class="pe-word">${esc(row[2])}</div><p class="pe-hint">알맞은 뜻을 골라보세요.</p><div class="pe-options">${choices.map((text,n)=>`<button type="button" class="pe-option" data-pe="choice" data-choice="${n}" ${fb?'disabled':''}>${esc(text)}</button>`).join('')}</div>`:`<div class="pe-meaning">${esc(row[3])}</div>${w.stage==='recall'?'<p class="pe-hint">중복되는 뜻이나 보기 부족으로 직접 쓰기로 확인합니다.</p>':''}<label for="pe-answer" class="pe-hint">영어 단어를 입력하세요</label><input class="pe-answer" id="pe-answer" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(w.drafts.get(key(w,i))||'')}" ${fb?'readonly':''}>${!fb?button('check','답 확인하기','primary'):''}`;
    return `<div class="pe-topline"><span>${stages[w.stage]}</span><span class="pe-count">${pos+1} / ${w.queue.length}</span></div><div class="pe-progress" role="progressbar" aria-label="현재 연습 위치" aria-valuenow="${pos+1}" aria-valuemin="0" aria-valuemax="${w.queue.length}"><span style="width:${(pos+1)/w.queue.length*100}%"></span></div><div class="pe-card">${input}${fb?`<div class="pe-feedback ${fb.correct?'is-correct':'is-wrong'}" role="status">${fb.correct?'맞았어요.':`정답: ${esc(row[2])} · ${esc(row[3])}`} ${!fb.correct?button('retry','이 단어 다시 확인','quiet'):''}</div>`:''}</div><div class="pe-actions">${button('prev','← 이전 단어','secondary',pos===0?'disabled':'')}${button('next',pos+1===w.queue.length?'이번 단계 마치기 →':'다음 단어 →','primary',!complete(w,i)?'disabled':'')}${w.parent?button('restore','원래 연습으로','quiet'):''}${button('overview','← 시험범위로','quiet')}</div>`;
  }
  function finish(s,w){const difficult=w.queue.filter(i=>weak(w,i));return `<div class="pe-result"><p class="pe-eyebrow">SESSION COMPLETE</p><h2 class="pe-title">이번 단계를 마쳤어요.</h2><p>카드 자기평가 ${w.cards.size}개 · 뜻 선택 ${w.recalls.size}개 · 철자 확인 ${w.spells.size}개</p><p class="pe-hint">서로 다른 확인 방식의 기록입니다. 공식 성적이나 숙달 점수를 뜻하지 않습니다.</p><div class="pe-actions">${difficult.length?button('weak',`다시 볼 ${difficult.length}단어 연습`,'primary'):''}${w.view==='challenge'&&w.stage!=='spell'?button('advance','다음 학습 단계 →','primary'):''}${w.parent?button('restore','원래 연습으로','quiet'):''}${button('all','전체 범위 다시 연습')}${button('overview','시험범위로','quiet')}</div></div>`;}
  function batchProgress(s){
    if(!s.sourceRows||s.sourceRows.length<=200)return '';
    let checkedCount=0;for(const w of s.experienceBatches.values())checkedCount+=w.rows.filter((_,i)=>checked(w,i)).length;
    return `<p class="pe-hint">배정·선택 범위 전체 ${s.sourceRows.length}단어 · 이번 묶음 ${s.rows.length}단어 · 점검한 단어 ${checkedCount}/${s.sourceRows.length}</p>`;
  }
  function render(selector) {
    const s=current();if(!s)return;const w=workspace(s),target=document.getElementById('practice-view');if(!target)return;
    s.mode=w.screen==='study'?w.stage:'';s.finished=w.screen!=='study';
    target.innerHTML=`<div class="practice-experience" data-experience="${w.view}"><header class="pe-header"><div><p class="pe-eyebrow">ALL바른 · PERSONAL PRACTICE</p><p class="pe-scope">${esc(scopeLabel(s))} · ${s.rows.length}단어</p></div>${button('source',s.returnTab==='vocab'?'단어장으로':'학습일정으로','quiet')}</header><nav class="pe-nav" aria-label="학습 경험">${Object.entries(labels).map(([view,label])=>`<button type="button" class="pe-mode" aria-pressed="${w.view===view}" data-pe="view" data-view="${view}">${label}</button>`).join('')}</nav>${w.screen==='study'?`<div class="pe-steps ${w.view!=='challenge'?'pe-two-steps':''}" role="group" aria-label="연습 단계">${Object.entries(stages).filter(([stage])=>w.view==='challenge'||stage!=='recall').map(([stage,label])=>button('stage',({card:'암기 카드',recall:'뜻 고르기',spell:'직접 쓰기'})[stage],'secondary',`data-stage="${stage}" aria-pressed="${w.stage===stage}"`)).join('')}</div>`:''}${w.screen==='overview'?overview(s,w):w.screen==='finish'?finish(s,w):study(s,w)}<footer class="pe-hint">개인 연습 · 공식 시험 성적과 포인트에 반영되지 않습니다.</footer>${batchProgress(s)}${assignedPracticeBatchControls()}</div>`;
    if(selector)focus(target,selector);
  }
  function begin(w,queue){w.queue=shuffleAssignedPractice(queue);w.positions={card:0,recall:0,spell:0};w.feedback.clear();w.round.clear();w.screen='study';w.started=true;}
  function dispatch(el){const s=current();if(!s)return;const w=workspace(s),action=el.dataset.pe;let selector='[data-pe="next"]';const i=index(w);
    if(action==='view'){w.view=el.dataset.view;if(w.view==='focus'&&w.stage==='recall')w.stage='card';w.screen='overview';selector='[data-pe="start"]';}
    else if(action==='start'){if(w.positions[w.stage]>=w.queue.length)w.positions[w.stage]=0;w.screen='study';w.started=true;}
    else if(action==='overview'){w.screen='overview';selector='[data-pe="start"]';}
    else if(action==='stage'){w.stage=el.dataset.stage;w.screen='study';w.started=true;if(w.positions[w.stage]>=w.queue.length)w.positions[w.stage]=0;}
    else if(action==='reveal'){w.revealed.has(i)?w.revealed.delete(i):w.revealed.add(i);selector='[data-pe="reveal"]';}
    else if(action==='known'||action==='difficult'){w.cards.set(i,action==='known');w.round.add(key(w,i));}
    else if(action==='prev'){w.positions[w.stage]=Math.max(0,w.positions[w.stage]-1);}
    else if(action==='next'){if(!complete(w,i))return;w.positions[w.stage]++;if(w.positions[w.stage]>=w.queue.length)w.screen='finish';}
    else if(action==='retry'){w.feedback.delete(key(w,i));selector='#pe-answer, [data-pe="choice"]';}
    else if(action==='check'||action==='choice'){
      const row=s.rows[i];let correct;if(action==='choice'){const text=w.choices.get(i)?.[Number(el.dataset.choice)];correct=text===String(row[3]).trim();w.recalls.set(i,correct);}else{const answer=w.drafts.get(key(w,i))||'';if(!answer.trim()){document.getElementById('pe-answer')?.setAttribute('aria-invalid','true');document.getElementById('pe-answer')?.focus();return;}correct=isAssignedPracticeSpellingCorrect(answer,row);(w.stage==='recall'?w.recalls:w.spells).set(i,correct);}
      w.feedback.set(key(w,i),{correct});w.round.add(key(w,i));
    }
    else if(action==='weak'){const queue=s.rows.map((_,n)=>n).filter(n=>weak(w,n));if(!queue.length)return;if(!w.parent)w.parent={queue:w.queue,positions:{...w.positions},stage:w.stage,feedback:new Map(w.feedback),round:new Set(w.round),drafts:new Map(w.drafts)};begin(w,queue);for(const n of queue)for(const stage of Object.keys(stages))w.drafts.delete(stage+':'+n);}
    else if(action==='restore'){if(w.parent){Object.assign(w,w.parent);w.parent=null;w.screen=w.positions[w.stage]>=w.queue.length?'finish':'study';}}
    else if(action==='all'){
      const source=s.sourceRows||s.rows,view=w.view,stage=w.stage;
      s.sourceRows=shuffleAssignedPractice(source);s.batchStart=0;s.rows=s.sourceRows.slice(0,200);
      s.experience=null;s.experienceBatches=new Map();const fresh=workspace(s);fresh.view=view;fresh.stage=stage;begin(fresh,s.rows.map((_,n)=>n));
    }
    else if(action==='advance'){w.stage=w.stage==='card'?'recall':'spell';w.positions[w.stage]=0;w.screen='study';}
    else if(action==='inspect'){const n=Number(el.dataset.index);w.queue=s.rows.map((_,n)=>n);w.positions[w.stage]=n;w.screen='study';w.started=true;}
    else if(action==='page-prev'){w.page=Math.max(0,w.page-1);selector='[data-pe="page-next"]';}
    else if(action==='page-next'){w.page=Math.min(Math.ceil(s.rows.length/6)-1,w.page+1);selector='[data-pe="page-prev"]';}
    else if(action==='source'){assignedPracticeReturnToSource();return;}
    else if(action==='mock'){w.enteringMock=true;try{assignedPracticeChooseMode('mock');}finally{w.enteringMock=false;}return;}
    render(selector);
  }
  document.addEventListener('click',event=>{const el=event.target.closest('#practice-view [data-pe]');if(el&&!el.disabled)dispatch(el);});
  document.addEventListener('input',event=>{if(event.target.id!=='pe-answer'||!current())return;const w=workspace(current());w.drafts.set(key(w,index(w)),event.target.value);});
  document.addEventListener('keydown',event=>{if(event.target.id!=='pe-answer'||event.key!=='Enter'||event.isComposing)return;event.preventDefault();const s=current();if(!s)return;const w=workspace(s);const action=w.feedback.has(key(w,index(w)))?'next':'check';const el=document.querySelector(`#practice-view [data-pe="${action}"]`);if(el&&!el.disabled)dispatch(el);});
  window.PracticeExperience={render,hasDraft(){const s=current();if(!s?.experience||s.mode==='mock'||s.experience.enteringMock)return false;return [...s.experience.drafts].some(([k,v])=>String(v).trim()&&!s.experience.feedback.has(k));},back(){const s=current();if(!s?.experience||s.mode==='mock')return false;workspace(s).screen='overview';render('[data-pe="start"]');return true;}};
})();
