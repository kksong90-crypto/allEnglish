/* Local candidate loader: no request until explicit administrator click. */
const AdminSchoolScopePreview=(()=>{
 let controller=null,loading=null,generation=0;
 async function open(planId,button){const requested=generation,epoch=studentSessionEpoch;if(String(currentUser?.role||'').toLowerCase()!=='admin')return;
  if(!controller){if(!loading)loading=import('./admin-school-scope-preview.mjs').then(({createAdminSchoolScopePreview})=>{controller=createAdminSchoolScopePreview({getUser:()=>currentUser,getEpoch:()=>studentSessionEpoch,request:p=>apiPost(p,Math.max(API_LONG_TIMEOUT_MS,270000)),sha256:async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join(''),document});return controller;}).catch(error=>{loading=null;throw error;});try{await loading;}catch(error){if(button)button.textContent='미리보기 모듈을 불러오지 못했습니다.';return;}}
  if(requested===generation&&epoch===studentSessionEpoch)return controller.open(planId,button);
 }
 function cancelAll(){generation++;if(controller)controller.cancelAll();}
 return{open,cancelAll};
})();
function renderAdminSchoolScopeButton(item,readOnly){
 // Real schedule DTOs keep weekday planType REGULAR while pointing at the
 // separately confirmed SCHOOL_EXAM plan. Never send the regular plan ID.
 const id=String(item?.schoolScopePlanId||(item?.planType==='SCHOOL_EXAM'?item.testPlanId:'')||'');if(!readOnly||String(currentUser?.role||'').toLowerCase()!=='admin'||item?.vocaScopeState!=='CONNECTED'||!/^[A-Za-z0-9._:-]{3,160}$/.test(id))return '';
 return `<button class="vocab-btn secondary" type="button" data-test-plan-id="${escapeHtml(id)}" onclick="AdminSchoolScopePreview.open(this.dataset.testPlanId,this)">시험범위 본문 확인 · 읽기 전용</button>`;
}
