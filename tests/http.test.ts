import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {makeServer} from '../server/node.ts';

test('HTTP server persists rooms across restart and protects source files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arena-http-'));
 let app=makeServer({database:join(dir,'test.sqlite')});
 async function start(){app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${(app.server.address() as any).port}`}
 async function stop(){await new Promise<void>((ok,fail)=>app.server.close(e=>e?fail(e):ok()))}
 try{
  let base=await start();
  const created=await fetch(base+'/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create'})});
  assert.equal(created.status,200);const session=await created.json() as any;
  assert.equal((await fetch(base+'/server/node.ts')).status,404);
  assert.equal((await fetch(base+'/api/unknown')).status,404);
  await stop();app=makeServer({database:join(dir,'test.sqlite')});base=await start();
  const recovered=await fetch(base+'/api/game?code='+session.code,{headers:{Authorization:`Bearer ${session.token}`}});
  assert.equal(recovered.status,200);assert.equal((await recovered.json() as any).phase,'lobby');
 }finally{if(app.server.listening)await stop();await rm(dir,{recursive:true,force:true})}
});
