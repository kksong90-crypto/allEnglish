/* Student shell updates only. No service worker, credentials, cache deletion or data writes. */
(function(root) {
  'use strict';
  function hash(text) {
    let h=2166136261;
    for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
    return (h>>>0).toString(16);
  }
  function signature(doc) {
    return hash(Array.from(doc.querySelectorAll('script,style,link[rel="stylesheet"],link[rel="manifest"]'))
      .map(el=>[el.tagName,el.getAttribute('src')||el.getAttribute('href')||'',el.textContent||''].join('|')).join('\n'));
  }
  function createController(env) {
    let pending=null,checking=false,applying=false,applied=false,inflight=0,lastActivity=env.now(),failed=false;
    const holds=new Set();
    return {
      activity(){lastActivity=env.now();},
      hold(reason){const key={reason};holds.add(key);return ()=>holds.delete(key);},
      async protect(fn){inflight++;try{return await fn();}finally{inflight--;lastActivity=env.now();}},
      async check(){
        if(checking||applying||applied||!env.visible()||!env.online())return false;
        checking=true;
        try {
          const release=await env.readRelease();
          failed=false;
          if(release && release!==env.currentRelease){pending=release;env.notify('pending');}
          return Boolean(pending);
        } catch(ignore) {failed=true;return false;}
        finally{checking=false;}
      },
      async tick(){
        if(!pending||applying||applied||failed||!env.visible()||!env.online()||inflight||holds.size||env.busy()||env.now()-lastActivity<10000)return false;
        if(!env.canReload(pending)){env.notify('paused');return false;}
        applying=true;
        try {
          // Recheck immediately before navigation; never reload from a stale detection.
          const release=await env.readRelease();
          if(!release||release!==pending){pending=release&&release!==env.currentRelease?release:null;return false;}
          if(!env.visible()||!env.online()||inflight||holds.size||env.busy()||env.now()-lastActivity<10000)return false;
          env.remember(pending);
          env.reload(pending);
          applied=true;pending=null;
          return true;
        }catch(ignore){return false;}
        finally{applying=false;}
      },
      state(){return {pending,checking,inflight,holds:holds.size,failed,applied};}
    };
  }
  const api={hash,signature,createController};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(!root||!root.document)return;
  root.AllbarunAutoUpdate=api;
  const doc=root.document;
  if(!doc.querySelector('meta[name="allbarun-app"][content="student-v1"]'))return;
  const initialSignature=signature(doc);
  const loadedModified=Date.parse(doc.lastModified)||0;
  let lastFullRead=0,lastSeenModified=0,lastObservedRelease=initialSignature,banner=null;
  const dirty=new Set();
  function fieldChanged(el) {
    if(el.type==='checkbox'||el.type==='radio')return el.checked!==el.defaultChecked;
    return String(el.value||'')!==String(el.defaultValue||'');
  }
  function busy(){
    // Exams, personal edits and administrator screens never auto-reload.
    let tab='';
    try{tab=typeof getActiveTabId==='function'?getActiveTabId():'';}catch(ignore){}
    if(tab&&!['home','exam','notice','report'].includes(tab))return true;
    try{if(typeof currentTestMeta!=='undefined'&&currentTestMeta&&!testAlreadySaved)return true;}catch(ignore){return true;}
    try{if(typeof currentPointTest!=='undefined'&&currentPointTest||typeof pointSubmitting!=='undefined'&&pointSubmitting||typeof loginRequestPending!=='undefined'&&loginRequestPending)return true;}catch(ignore){return true;}
    const focus=doc.activeElement;
    if(focus&&(focus.matches('input,textarea,select')||focus.isContentEditable))return true;
    for(const el of dirty){
      if(!el.isConnected||!fieldChanged(el)){dirty.delete(el);continue;}
      // Successfully signed-in users retain their session; old hidden login fields are irrelevant.
      let signedIn=false;try{signedIn=Boolean(typeof currentUser!=='undefined'&&currentUser&&currentUser.token);}catch(ignore){}
      if(signedIn&&el.closest('#login-screen'))continue;
      return true;
    }
    if(doc.querySelector('audio[srcObject],video[srcObject]'))return true;
    return false;
  }
  function notify(state){
    if(!banner){
      banner=doc.createElement('div');banner.id='app-update-status';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
      banner.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:11000;padding:12px 16px;border-radius:14px;background:#24534a;color:white;font:600 14px/1.5 sans-serif;box-shadow:0 4px 20px #0003;pointer-events:none';
      doc.body.appendChild(banner);
    }
    banner.textContent=state==='paused'?'새 버전 적용을 잠시 미뤘습니다. 로그인과 작성 내용은 유지됩니다.':'새 버전이 준비됐습니다. 진행 중인 작업을 마치면 자동으로 적용됩니다.';
  }
  const url=new URL('index.html',doc.baseURI);
  async function request(method){
    const u=new URL(url);u.searchParams.set('_app_check',String(Date.now()));
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
    try{
      const r=await root.fetch(u.href,{method,cache:'no-store',credentials:'omit',signal:abort.signal,redirect:'error'});
      if(!r.ok)throw Error('UPDATE_READ_FAILED');
      if(!(r.headers.get('content-type')||'').includes('text/html'))throw Error('UPDATE_NOT_HTML');
      return {headers:r.headers,body:method==='GET'?await r.text():null};
    }finally{clearTimeout(timer);}
  }
  async function readRelease(){
    const head=await request('HEAD');
    const modified=Date.parse(head.headers.get('last-modified')||'')||0;
    // Tiny HEAD requests are used normally. Full HTML is read on first check,
    // a newer deploy, and every 15 minutes as a fallback for missing date headers.
    if(modified===lastSeenModified&&lastFullRead&&Date.now()-lastFullRead<900000)return lastObservedRelease;
    const response=await request('GET');
    const text=response.body;
    if(text.length>2000000)throw Error('UPDATE_TOO_LARGE');
    const remote=new DOMParser().parseFromString(text,'text/html');
    if(!remote.querySelector('meta[name="allbarun-app"][content="student-v1"]'))throw Error('UPDATE_WRONG_APP');
    lastFullRead=Date.now();
    lastSeenModified=modified;
    const next=signature(remote);
    // A deployment can update external assets without changing the HTML scripts.
    lastObservedRelease=next!==initialSignature?next:(modified>loadedModified?'deploy-'+modified:initialSignature);
    return lastObservedRelease;
  }
  const storageKey='allbarun-shell-update-attempt';
  function previous(){try{return JSON.parse(root.sessionStorage.getItem(storageKey)||'null');}catch(ignore){return null;}}
  const controller=createController({
    currentRelease:initialSignature,now:()=>Date.now(),visible:()=>doc.visibilityState==='visible',
    online:()=>root.navigator.onLine!==false,busy,readRelease,notify,
    canReload:release=>{const old=previous();return new URL(root.location.href).searchParams.get('_app_build')!==release&&(!old||old.release!==release||old.count<2);},
    remember:release=>{try{const old=previous();root.sessionStorage.setItem(storageKey,JSON.stringify({release,at:Date.now(),count:old&&old.release===release?old.count+1:1}));}catch(ignore){}},
    reload:release=>{const target=new URL(root.location.href);target.searchParams.set('_app_build',release);root.location.replace(target.href);}
  });
  api.controller=controller;api.hold=reason=>controller.hold(reason);
  // Track full request promises, not just transport completion, including error paths.
  for(const name of ['apiPost','apiGet']){
    if(typeof root[name]!=='function')continue;
    const original=root[name];
    root[name]=function(...args){return controller.protect(()=>original.apply(this,args));};
  }
  for(const type of ['pointerdown','keydown','touchstart'])doc.addEventListener(type,()=>controller.activity(),{passive:true});
  doc.addEventListener('input',event=>{if(event.target&&event.target.matches('input,textarea,select'))dirty.add(event.target);controller.activity();});
  doc.addEventListener('change',event=>{if(event.target&&event.target.matches('input,textarea,select'))dirty.add(event.target);controller.activity();});
  let pendingTimer=null;
  function scheduleApply(){
    if(!controller.state().pending||pendingTimer!==null||doc.visibilityState!=='visible')return;
    pendingTimer=root.setTimeout(async()=>{pendingTimer=null;await controller.tick();scheduleApply();},5000);
  }
  async function check(){
    await controller.check();await controller.tick();scheduleApply();
  }
  root.addEventListener('focus',check);
  root.addEventListener('online',check);
  root.addEventListener('pageshow',check);
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')check();});
  root.setInterval(check,60000);
  root.setTimeout(check,2000);
})(typeof window==='object'?window:null);

