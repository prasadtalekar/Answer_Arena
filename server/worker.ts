import {createApi} from './api.ts';
import {D1Store} from './d1.ts';
export interface Env {DB:D1Database; ASSETS:Fetcher; HOST_CREATE_KEY?:string}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==='/api/game')return createApi(new D1Store(env.DB),{ip:request.headers.get('cf-connecting-ip')??'unknown',hostCreateKey:env.HOST_CREATE_KEY})(request);
  if(path.startsWith('/api/'))return Response.json({error:'Not found'},{status:404});
  return env.ASSETS.fetch(request);
 },
 async scheduled(_event:ScheduledController,env:Env){
  const now=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM arena_rooms WHERE expires<=?').bind(now),env.DB.prepare('DELETE FROM arena_limits WHERE expires<=?').bind(now)]);
 }
};
