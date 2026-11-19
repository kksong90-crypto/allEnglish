// Prepared words are reusable content, never reusable permission. Every load starts
// with an authenticated manifest. No credentials or student responses are stored here.
(function (root) {
  'use strict';
  const MAX_WORDS = 5000, MAX_CONTENTS = 12, MAX_TOTAL_WORDS = 25000;
  const MAX_ASSIGNMENTS = 50, MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const identityKeys = ['assignmentKey','generation','scopeFingerprint','setId','contentHash','wordCount','testPlanId','slotKey','personalScopeFingerprint'];
  function failure(code) { const e = new Error(code); e.code = code; return e; }
  function unsupported(reply) {
    return reply?.success === false && (reply.code === 'UNSUPPORTED_ACTION' || reply.error?.code === 'UNSUPPORTED_ACTION' ||
      reply.message === 'Unknown action: getMyPreparedVocabManifest');
  }
  function manifestIdentity(value) {
    if (!value || value.success !== true || value.status !== 'READY') throw failure(value?.status === 'PREPARING' ? 'PREPARED_PENDING' : 'PREPARED_UNAVAILABLE');
    for (const key of ['assignmentKey','generation','scopeFingerprint','setId','testPlanId']) {
      if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 512) throw failure('PREPARED_IDENTITY_INVALID');
    }
    if (!/^[a-f0-9]{64}$/.test(value.contentHash || '') || !Number.isInteger(value.wordCount) || value.wordCount < 1 || value.wordCount > MAX_WORDS ||
        typeof value.slotKey !== 'string' || typeof value.personalScopeFingerprint !== 'string') throw failure('PREPARED_IDENTITY_INVALID');
    if (value.sourceFence !== undefined && typeof value.sourceFence !== 'string') throw failure('PREPARED_IDENTITY_INVALID');
    return {...Object.fromEntries(identityKeys.map(key => [key,value[key]])),...(value.sourceFence!==undefined?{sourceFence:value.sourceFence}:{})};
  }
  function sameIdentity(a,b) { return identityKeys.every(key => a[key] === b[key]) && (a.sourceFence===undefined || b.sourceFence===undefined || a.sourceFence===b.sourceFence); }
  function validateWords(words,count) {
    if (!Array.isArray(words) || words.length !== count || count < 1 || count > MAX_WORDS) throw failure('PREPARED_INCOMPLETE');
    const seen = new Set();
    return words.map(w => {
      for (const key of ['bookId','vocabWordId','word','meaning']) if (typeof w?.[key] !== 'string' || !w[key].trim()) throw failure('PREPARED_WORD_INVALID');
      if (!Array.isArray(w.acceptedAnswers) || !w.acceptedAnswers.length || w.acceptedAnswers.some(a => typeof a !== 'string' || !a.trim())) throw failure('PREPARED_WORD_INVALID');
      const key = JSON.stringify([w.bookId,w.vocabWordId]);
      if (seen.has(key)) throw failure('PREPARED_DUPLICATE');
      seen.add(key);
      return {bookId:w.bookId,vocabWordId:w.vocabWordId,word:w.word,meaning:w.meaning,acceptedAnswers:[...w.acceptedAnswers]};
    });
  }
  async function contentHash(words,cryptoProvider=root.crypto) {
    if (!cryptoProvider?.subtle || typeof TextEncoder === 'undefined') throw failure('PREPARED_HASH_UNAVAILABLE');
    const canonical = JSON.stringify(words.map(w => [w.bookId,w.vocabWordId,w.word,w.meaning,w.acceptedAnswers]));
    const digest = await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(digest),b => b.toString(16).padStart(2,'0')).join('');
  }
  function indexedStore(indexedDB=root.indexedDB, now=Date.now) {
    let database;
    function open() {
      if (!indexedDB) return Promise.reject(failure('PREPARED_STORAGE_UNAVAILABLE'));
      if (!database) database = new Promise((resolve,reject) => {
        const request = indexedDB.open('allbarun-prepared-practice-v1',2);
        request.onupgradeneeded = () => {
          for (const name of ['contents','assignments']) {
            const store=request.result.objectStoreNames.contains(name)?request.transaction.objectStore(name):request.result.createObjectStore(name,{keyPath:'key'});
            // Existing v1 rows are indexed by the browser without downloading
            // or materializing their word arrays in JavaScript.
            if (!store.indexNames.contains('gc')) store.createIndex('gc',['lastUsed','wordCount']);
          }
        };
        request.onsuccess = () => { const db=request.result; db.onversionchange=()=>{db.close();database=null;};resolve(db); };
        request.onerror = () => reject(failure('PREPARED_STORAGE_UNAVAILABLE'));
        request.onblocked = () => reject(failure('PREPARED_STORAGE_UNAVAILABLE'));
      }).catch(e => { database=null;throw e; });
      return database;
    }
    async function transaction(names,mode,work) {
      const db=await open();
      return new Promise((resolve,reject) => {
        const tx=db.transaction(names,mode);let result;
        tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure('PREPARED_STORAGE_UNAVAILABLE'));
        try {work(tx,value=>{result=value;});} catch (_) {tx.abort();}
      });
    }
    return {
      async read(hash) { return transaction(['contents'],'readonly',(tx,set)=>{const r=tx.objectStore('contents').get(hash);r.onsuccess=()=>set(r.result||null);}); },
      async peek(owner,selection) {
        // At most 50 small assignment pointers; never read a word body for hints.
        return transaction(['assignments','contents'],'readonly',(tx,set)=>{
          const request=tx.objectStore('assignments').getAll();
          request.onsuccess=()=>{
            const pointer=request.result.filter(r=>r.owner===owner&&r.testPlanId===selection.testPlanId&&r.slotKey===(selection.slotKey||'')&&r.personalScopeFingerprint===(selection.personalScopeFingerprint||'')&&/^[a-f0-9]{64}$/.test(r.contentHash||''))
              .sort((a,b)=>b.lastUsed-a.lastUsed)[0];
            if(!pointer){set('');return;}
            const present=tx.objectStore('contents').getKey(pointer.contentHash);
            present.onsuccess=()=>set(present.result===pointer.contentHash?pointer.contentHash:'');
          };
        });
      },
      async write(owner,identity,words) {
        return transaction(['contents','assignments'],'readwrite',tx=>{
          const stamp=now();tx.objectStore('contents').put({key:identity.contentHash,words,wordCount:words.length,lastUsed:stamp});
          tx.objectStore('assignments').put({key:JSON.stringify([owner,identity.assignmentKey]),owner,...identity,wordCount:words.length,lastUsed:stamp});
          // GC happens in the same transaction as the write. Retain at most 12
          // complete sets / 25k words / 50 assignment pointers, and at most 7 days.
          for (const name of ['contents','assignments']) {
            // Key cursors expose only timestamps/counts/keys, never word bodies.
            const store=tx.objectStore(name),request=store.index('gc').openKeyCursor(null,'prev');let kept=0,total=0;
            request.onsuccess=()=>{
              const cursor=request.result;if(!cursor)return;
              const [lastUsed,wordCount]=cursor.key,size=name==='contents'?wordCount:0;
              const malformed=typeof cursor.primaryKey!=='string'||!Number.isFinite(lastUsed)||!Number.isInteger(wordCount)||wordCount<1||wordCount>MAX_WORDS;
              if (malformed || stamp-lastUsed>MAX_AGE || kept>=(name==='contents'?MAX_CONTENTS:MAX_ASSIGNMENTS) || total+size>MAX_TOTAL_WORDS) store.delete(cursor.primaryKey);
              else {kept++;total+=size;}
              cursor.continue();
            };
          }
        });
      },
      async discard(hash) { return transaction(['contents'],'readwrite',tx=>{tx.objectStore('contents').delete(hash);}); }
    };
  }
  let persistentStore;
  const transportFlights = new Map();
  function createClient({request,store,cryptoProvider=root.crypto}) {
    store ||= persistentStore || (persistentStore=indexedStore());
    async function transport(params,owner,sessionKey) {
      // Only simultaneous transport is shared. Session keys remain in memory,
      // and each load retains its own current-session check after every await.
      if (typeof sessionKey!=='string' || !sessionKey) return request(params);
      const key=JSON.stringify([owner,sessionKey,Object.entries(params).sort(([a],[b])=>a.localeCompare(b))]);
      let pending=transportFlights.get(key);
      if (!pending) {
        try {pending=Promise.resolve(request(params));} catch(error) {pending=Promise.reject(error);}
        transportFlights.set(key,pending);
      }
      try {return JSON.parse(JSON.stringify(await pending));}
      finally {if(transportFlights.get(key)===pending)transportFlights.delete(key);}
    }
    async function checkedWords(words,identity) {
      const valid=validateWords(words,identity.wordCount);
      if (await contentHash(valid,cryptoProvider)!==identity.contentHash) throw failure('PREPARED_HASH_MISMATCH');
      return valid;
    }
    return {async load(selection,{owner,sessionKey,isCurrent}) {
      const current=()=>{if(!isCurrent())throw failure('PREPARED_STALE_SESSION');};
      current();let knownContentHash='';
      if(typeof store.peek==='function'){try{const hint=await store.peek(owner,selection);if(/^[a-f0-9]{64}$/.test(hint||''))knownContentHash=hint;}catch(_){}}current();
      const reply=await transport({action:'getMyPreparedVocabManifest',...selection,preferBundle:'Y',knownContentHash},owner,sessionKey);current();
      if (unsupported(reply)) return null;
      const identity=manifestIdentity(reply);
      if (identity.testPlanId!==selection.testPlanId || identity.slotKey!==(selection.slotKey||'') || identity.personalScopeFingerprint!==(selection.personalScopeFingerprint||'')) throw failure('PREPARED_SELECTION_CHANGED');
      const bundled=Object.prototype.hasOwnProperty.call(reply,'words');
      if ((reply.selectionBundle!==undefined&&typeof reply.selectionBundle!=='boolean') ||
          (reply.wordsIncluded!==undefined&&typeof reply.wordsIncluded!=='boolean') ||
          (reply.selectionBundle===true&&typeof reply.wordsIncluded!=='boolean') ||
          (typeof reply.wordsIncluded==='boolean'&&reply.wordsIncluded!==bundled)) throw failure('PREPARED_BUNDLE_INVALID');
      let words;
      if(bundled){words=await checkedWords(reply.words,identity);current();}
      else {
        let cached;try {cached=await store.read(identity.contentHash);} catch (_) {}current();
        if(cached){try {words=await checkedWords(cached.words,identity);} catch (_) {try {await store.discard(identity.contentHash);} catch (_) {}}current();}
      }
      if (!words) {
        const response=await transport({action:'getMyPreparedVocabWords',assignmentKey:identity.assignmentKey,generation:identity.generation,setId:identity.setId,contentHash:identity.contentHash},owner,sessionKey);current();
        const bodyIdentity=manifestIdentity(response);
        if (!sameIdentity(identity,bodyIdentity)) throw failure('PREPARED_SCOPE_CHANGED');
        words=await checkedWords(response.words,identity);current();
      }
      current();try {await store.write(owner,identity,words);} catch (_) {} current();
      return {identity,words,planDate:typeof reply.planDate==='string'?reply.planDate:''};
    }};
  }
  root.PreparedPracticeCache = Object.freeze({createClient,indexedStore,validateWords,contentHash,manifestIdentity});
})(globalThis);
