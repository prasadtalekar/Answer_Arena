import {check,expireTurn,fresh,reduce,view,type Game} from '../lib/game.ts';
import {starterQuestions,samples} from '../lib/sample.ts';
import type {Store} from './store.ts';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const token=()=>crypto.randomUUID()+crypto.randomUUID();
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('')}
function roomCode(){return Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('')}
export type ApiOptions={ip?:string; now?:()=>number; hostCreateKey?:string};
export function createApi(store:Store,options:ApiOptions={}){
 const now=options.now??Date.now;
 async function authenticated(request:Request,code:string){
  check(/^[A-Z2-9]{8}$/.test(code),'Enter the eight-character room code.');
  const secret=request.headers.get('Authorization')?.replace(/^Bearer /,'')??'';
  check(secret.length>=60&&secret.length<100,'Your session is missing. Join again or recover your host session.');
  const digest=await hash(secret);
  for(let attempt=0;attempt<8;attempt++){
   const row=await store.read(code);check(row&&row.expires>now(),'Room not found or expired. Rooms last 24 hours.');
   const g:Game=JSON.parse(row.data);const actor=g.hostHash===digest?'host':g.players.find(p=>p.hash===digest)?.id;
   check(actor,'Session not recognized. Join again or recover your host session.');
   const timestamp=now();
   if(expireTurn(g,timestamp)){
    if(!await store.save(g,row.version))continue;
    return {g,actor,version:row.version+1};
   }
   return {g,actor,version:row.version};
  }
  throw new Error('The game is busy. Please try again.');
 }
 const state=(g:Game,actor:string,version:number)=>({...view(g,actor,now()),...(actor==='host'&&g.phase==='lobby'?{questionBank:samples}:{}),version});
 return async function api(request:Request):Promise<Response>{
  try{
   const url=new URL(request.url);
   if(request.method==='GET'){
    const {g,actor,version}=await authenticated(request,url.searchParams.get('code')??'');return reply(state(g,actor,version));
   }
   if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
   const origin=request.headers.get('Origin');check(!origin||origin===url.origin,'Cross-site requests are not allowed.');
   const raw=await request.text();check(raw.length<=24000,'Request is too large.');
   const body=JSON.parse(raw);check(body&&typeof body==='object'&&!Array.isArray(body),'Invalid request.');const {action}=body;
   const window=action==='create'?3600000:60000;
   // Action limits are per session so a whole office behind one IP can play.
   const scope=action==='create'?'create':request.headers.get('Authorization')??'join';
   const key=`${await hash(`${options.ip??'unknown'}:${scope}`)}:${Math.floor(now()/window)}`;
   if(!await store.rateLimit(key,(Math.floor(now()/window)+2)*window,action==='create'?10:120))return reply({error:'Too many requests. Please wait before trying again.'},429);
   if(action==='create'){
    if(options.hostCreateKey)check(typeof body.hostCreateKey==='string'&&await hash(body.hostCreateKey)===await hash(options.hostCreateKey),'A valid host creation password is required.');
    const secret=token(),g=fresh(roomCode(),await hash(secret),structuredClone(starterQuestions),now());
    await store.insert(g);return reply({code:g.code,token:secret,role:'host'});
   }
   if(action==='join'){
    const code=String(body.code??'').toUpperCase().trim(),name=String(body.name??'').trim();
    check(/^[A-Z2-9]{8}$/.test(code),'Enter the eight-character room code.');check(name.length>=2&&name.length<=24,'Your name needs 2–24 characters.');
    const secret=token(),digest=await hash(secret),id=crypto.randomUUID();
    for(let i=0;i<8;i++){
     const row=await store.read(code);check(row&&row.expires>now(),'Room not found or expired.');const g:Game=JSON.parse(row.data);
     check(g.phase==='lobby','This game has started. Ask your host to create another room.');check(g.players.length<40,'The room is full.');
     check(!g.players.some(p=>p.name.toLowerCase()===name.toLowerCase()),'That name is taken. Add an initial or use your existing tab.');
     const a=g.players.filter(p=>p.team==='A').length,b=g.players.length-a;g.players.push({id,name,hash:digest,team:a<=b?'A':'B'});
     if(await store.save(g,row.version))return reply({code,token:secret,role:'player'});
    }
    return reply({error:'Several players joined together. Please try again.'},409);
   }
   const {g,actor,version}=await authenticated(request,String(body.code??''));
   check(typeof body.requestId==='string'&&body.requestId.length>0&&body.requestId.length<=80,'A request ID is required.');
   if(g.recent.includes(body.requestId))return reply(state(g,actor,version));
   if(body.version!==version)return reply({error:'Game updated or time expired. Please try again.',state:state(g,actor,version)},409);
   if(action==='answer'||action==='spoken')check(body.turnId===g.turnId,'That answering turn has ended.');
   const timestamp=now();
   // Recheck after any asynchronous work: late answers must never beat the server deadline.
   if(expireTurn(g,timestamp)){
    await store.save(g,version);return reply({error:'Time expired. Your turn has ended.'},409);
   }
   reduce(g,action,body,actor,timestamp);g.recent.push(body.requestId);g.recent=g.recent.slice(-64);
   if(!await store.save(g,version))return reply({error:action==='buzz'?'Another player reached the buzzer first.':'Game updated. Please try again.'},409);
   return reply(state(g,actor,version+1));
  }catch(e){return reply({error:e instanceof Error?e.message:'Unable to complete that action.'},400)}
 };
}
