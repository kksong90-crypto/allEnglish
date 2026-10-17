import {collectStaffSchoolScope} from './staff-school-scope-client.mjs';
// Read-only UI controller. All credentials stay in the app's existing request closure.
export function createAdminSchoolScopePreview({getUser,getEpoch,request,sha256,document,collect=collectStaffSchoolScope}){
 const active=new Set(),permitted=()=>String(getUser()?.role||'').toLowerCase()==='admin';
 function cancelAll(){for(const r of active){r.cancelled=true;r.abort.abort();r.panel.remove();if(r.button.isConnected!==false){r.button.disabled=false;r.button.textContent=r.original;}}active.clear();}
 async function open(testPlanId,button){
  if(!permitted()||!button?.parentElement||!/^[A-Za-z0-9._:-]{3,160}$/.test(String(testPlanId)))return;
  cancelAll();const epoch=getEpoch(),panel=document.createElement('div'),status=document.createElement('p'),body=document.createElement('div'),cancel=document.createElement('button');
  const record={cancelled:false,abort:new AbortController(),panel,button,original:button.textContent};active.add(record);
  panel.setAttribute('aria-label','학교 시험범위 읽기 전용 미리보기');status.setAttribute('role','status');cancel.type='button';cancel.textContent='미리보기 닫기';cancel.addEventListener('click',cancelAll);panel.append(status,body,cancel);button.parentElement.append(panel);button.disabled=true;button.textContent='본문 확인 중…';status.textContent='확정 계획의 전체 본문을 읽는 중입니다. 일부 결과는 표시하지 않습니다.';
  const current=()=>!record.cancelled&&active.has(record)&&epoch===getEpoch()&&permitted()&&panel.isConnected!==false;
  try{
   const result=await collect({testPlanId,request:async(params,signal)=>{if(!current()||signal?.aborted)throw Error('ADMIN_PREVIEW_CANCELLED');return request(params,signal);},sha256,signal:record.abort.signal});
   if(!current())return;if(result?.complete!==true||!Array.isArray(result.ranges)||result.count!==result.ranges.reduce((n,r)=>n+r.words.length,0))throw Error('ADMIN_PREVIEW_INCOMPLETE');
   const words=result.ranges.flatMap(r=>r.words),pageSize=100;let offset=0;
   function render(){if(!current())return;body.replaceChildren();const table=document.createElement('table');table.style.width='100%';table.style.tableLayout='fixed';
    for(const word of words.slice(offset,offset+pageSize)){const row=document.createElement('tr');for(const value of [word.sectionLabel||word.sectionId,word.word,word.meaning]){const cell=document.createElement('td');cell.textContent=String(value);cell.style.whiteSpace='pre-wrap';cell.style.overflowWrap='anywhere';row.append(cell);}table.append(row);}body.append(table);
    const label=document.createElement('p');label.textContent=`전체 ${words.length}단어 중 ${words.length?offset+1:0}–${Math.min(offset+pageSize,words.length)} 표시`;body.append(label);
    for(const [text,next] of [['이전',offset-pageSize],['다음',offset+pageSize]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=next<0||next>=words.length;b.addEventListener('click',()=>{offset=next;render();});body.append(b);}
   }
   render();status.textContent=`전체 ${result.count}단어 본문 검증 완료 · 읽기 전용. 실제 학생 화면·인쇄 경로의 활성화를 뜻하지 않습니다.`;
  }catch(error){if(current()){body.replaceChildren();status.textContent='본문 전체 검증을 완료하지 못했습니다. 일부 결과는 표시하지 않았으며 자동 재요청하지 않습니다.';}}
  finally{if(current()){button.disabled=false;button.textContent=record.original;}else if(active.has(record)){record.cancelled=true;record.abort.abort();panel.remove();active.delete(record);if(button.isConnected!==false){button.disabled=false;button.textContent=record.original;}}}
 }
 return{open,cancelAll};
}
