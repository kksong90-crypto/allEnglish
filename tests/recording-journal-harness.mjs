// Legacy focused tests keep their own DOM/API mocks; use the real journal format.
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
export function memoryStorage(){const map=new Map();return{get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}}
export function journalContext(){
 const factory={};vm.createContext(factory);vm.runInContext(source.slice(source.indexOf('function createRecordingJournal('),source.indexOf('function recordingJournal(')),factory);
 const journal=factory.createRecordingJournal(memoryStorage());
 return{recordingJournal:()=>journal,apiUrl:()=> 'https://example.test/exec',recordingSession:()=> 'session',
  retainedRecordingCheck:()=>false,pendingRecordingChecks:()=>journal.list().items,
  retainRecordingAttempt:(a,state)=>journal.put({...a,state}),removeRecordingAttempt:a=>{journal.remove(a);return true},
  renderRecordingRecovery(){},recoverRecordingChecks(){}};
}
