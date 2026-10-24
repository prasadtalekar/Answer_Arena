import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {SQLiteStore} from './sqlite.ts';
import {createApi} from './api.ts';
import {expireTurn,type Game} from '../lib/game.ts';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
export function makeServer({database=resolve(root,'data/arena.sqlite'),assets=resolve(root,'dist'),hostCreateKey=process.env.HOST_CREATE_KEY}={}){
 const store=new SQLiteStore(database);
 const server=createServer(async(req,res)=>{
  try{
   const origin=process.env.PUBLIC_ORIGIN||`http://${req.headers.host??'localhost:3000'}`;
   const url=new URL(req.url??'/',origin);
   if(url.pathname==='/api/game'){
    let bytes=0;const chunks:Buffer[]=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>24000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(url,{method:req.method,headers,...(req.method==='GET'||req.method==='HEAD'?{}:{body:Buffer.concat(chunks)})});
    const response=await createApi(store,{ip:req.socket.remoteAddress??'unknown',hostCreateKey})(request);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(url.pathname.startsWith('/api/')){res.writeHead(404);res.end('Not found');return}
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end('Method not allowed');return}
   const requested=decodeURIComponent(url.pathname);const name=requested==='/'||requested==='/host'||requested==='/host/'?'index.html':requested.slice(1);
   const path=resolve(assets,name);if(!path.startsWith(resolve(assets)+sep)){res.writeHead(403);res.end('Forbidden');return}
   let data:Buffer;try{data=await readFile(path)}catch{res.writeHead(404);res.end('Not found. Run npm run build first.');return}
   const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
   res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':name==='index.html'?'no-cache':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
   res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(500);res.end('Unable to process request')}
 });
 const sweep=setInterval(async()=>{try{const now=Date.now();for(const row of store.due(now)){const g:Game=JSON.parse(row.data);if(expireTurn(g,now))await store.save(g,row.version)}}catch(e){console.error('Timer sweep failed',e)}},500);sweep.unref();
 const cleanup=setInterval(()=>store.cleanup(Date.now()),3600000);cleanup.unref();store.cleanup(Date.now());
 server.on('close',()=>{clearInterval(sweep);clearInterval(cleanup);store.close()});return {server,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server}=makeServer({database:process.env.DATA_FILE?resolve(process.env.DATA_FILE):undefined});
 const port=Number(process.env.PORT??3000);server.listen(port,process.env.HOST??'0.0.0.0',()=>console.log(`Answer Arena ready: http://localhost:${port}/ (players), /host (host)`));
 const stop=()=>server.close(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
