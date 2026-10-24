import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLiteStore} from '../server/sqlite.ts';
import {createApi} from '../server/api.ts';

type Session={code:string;token:string;role:string};
async function fixture(){
 const store=new SQLiteStore(':memory:');let clock=1000000;
 const api=createApi(store,{ip:'test',now:()=>clock});
 async function post(body:Record<string,unknown>,s?:Session){const response=await api(new Request('http://arena.test/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(s?{Authorization:`Bearer ${s.token}`}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json() as any}}
 async function state(s:Session){const response=await api(new Request(`http://arena.test/api/game?code=${s.code}`,{headers:{Authorization:`Bearer ${s.token}`}}));return {status:response.status,body:await response.json() as any}}
 const h=(await post({action:'create'})).body as Session;
 const a=(await post({action:'join',code:h.code,name:'Alice'})).body as Session;
 const b=(await post({action:'join',code:h.code,name:'Bob'})).body as Session;
 async function act(s:Session,action:string,data:Record<string,unknown>={}){const current=(await state(s)).body;return post({action,code:s.code,version:current.version,turnId:current.turnId,requestId:crypto.randomUUID(),...data},s)}
 await act(h,'start');return {store,api,h,a,b,post,state,act,setTime:(t:number)=>{clock=t},now:()=>clock};
}

test('API reveals first approved answer to the opposing player immediately',async()=>{
 const f=await fixture();try{
  await f.act(f.a,'buzz');await f.act(f.a,'answer',{text:'Confidence'});await f.act(f.h,'judge',{rank:0});
  const s=(await f.state(f.b)).body;assert.equal(s.phase,'faceoff');assert.equal(s.answers[0].text,'Confidence');assert.equal(s.liveScores.A,50);
  assert.ok(s.answers.slice(1).every((a:any)=>a.text===null));assert.equal(s.questions,undefined);assert.equal(s.questionBank,undefined);
 }finally{f.store.close()}
});
test('API read applies timeout once under concurrent polls and rejects stale late answer',async()=>{
 const f=await fixture();try{
  await f.act(f.a,'buzz');const before=(await f.state(f.a)).body;f.setTime(before.answerDeadline);
  const reads=await Promise.all([f.state(f.h),f.state(f.a),f.state(f.b)]);
  assert.ok(reads.every(r=>r.status===200));const after=(await f.state(f.h)).body;assert.equal(after.version,before.version+1);assert.equal(after.face.A,-1);
  const late=await f.post({action:'answer',code:f.a.code,text:'late',version:before.version,turnId:before.turnId,requestId:crypto.randomUUID()},f.a);assert.equal(late.status,409);
  assert.equal((await f.state(f.h)).body.version,after.version);
 }finally{f.store.close()}
});
test('API accepts a timely answer, pauses for host, and handles duplicate requests idempotently',async()=>{
 const f=await fixture();try{
  await f.act(f.a,'buzz');const before=(await f.state(f.a)).body;f.setTime(before.answerDeadline-1);
  const body={action:'answer',code:f.a.code,text:'Confidence',version:before.version,turnId:before.turnId,requestId:crypto.randomUUID()};
  const first=await f.post(body,f.a);assert.equal(first.status,200);assert.equal(first.body.answerDeadline,null);
  f.setTime(before.answerDeadline+100000);const duplicate=await f.post(body,f.a);assert.equal(duplicate.status,200);assert.equal(duplicate.body.version,first.body.version);
  assert.equal((await f.act(f.h,'judge',{rank:0})).status,200);
 }finally{f.store.close()}
});
test('concurrent buzzes produce exactly one winner through compare-and-swap',async()=>{
 const f=await fixture();try{
  const before=(await f.state(f.h)).body;
  const replies=await Promise.all([f.a,f.b].map(s=>f.post({action:'buzz',code:s.code,version:before.version,requestId:crypto.randomUUID()},s)));
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.equal((await f.state(f.h)).body.version,before.version+1);
 }finally{f.store.close()}
});
test('player cannot change scores or control; stale turn tokens cannot submit answers',async()=>{
 const f=await fixture();try{
  assert.equal((await f.act(f.a,'adjust',{team:'A',points:100,reason:'cheat'})).status,400);
  assert.equal((await f.act(f.a,'turn',{player:'bad'})).status,400);
  await f.act(f.a,'buzz');const before=(await f.state(f.a)).body;
  const stale=await f.post({action:'answer',code:f.a.code,version:before.version,turnId:'old',requestId:crypto.randomUUID(),text:'answer'},f.a);assert.equal(stale.status,400);
 }finally{f.store.close()}
});
test('invalid credentials, cross-origin writes, expired rooms and optional host password are checked',async()=>{
 const f=await fixture();try{
  assert.equal((await f.state({...f.a,token:'x'.repeat(72)})).status,400);
  const cross=await f.api(new Request('http://arena.test/api/game',{method:'POST',headers:{Origin:'http://evil.test'},body:JSON.stringify({action:'create'})}));assert.equal(cross.status,400);
  const protectedApi=createApi(f.store,{hostCreateKey:'private-password',now:f.now});
  const blocked=await protectedApi(new Request('http://arena.test/api/game',{method:'POST',body:JSON.stringify({action:'create'})}));assert.equal(blocked.status,400);
  const allowed=await protectedApi(new Request('http://arena.test/api/game',{method:'POST',body:JSON.stringify({action:'create',hostCreateKey:'private-password'})}));assert.equal(allowed.status,200);
  f.setTime(f.now()+86400001);assert.equal((await f.state(f.h)).status,400);
 }finally{f.store.close()}
});
