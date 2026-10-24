import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {SCHEMA, type Store, type Row} from './store.ts';
import type {Game} from '../lib/game.ts';
export class SQLiteStore implements Store {
  db:DatabaseSync;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');this.db.exec(SCHEMA);
  }
  async read(code:string){return this.db.prepare('SELECT code,data,version,expires FROM arena_rooms WHERE code=?').get(code) as Row|undefined??null}
  async insert(g:Game){this.db.prepare('INSERT INTO arena_rooms(code,data,version,expires) VALUES(?,?,0,?)').run(g.code,JSON.stringify(g),g.created+86400000)}
  async save(g:Game,version:number){return this.db.prepare('UPDATE arena_rooms SET data=?,version=version+1 WHERE code=? AND version=?').run(JSON.stringify(g),g.code,version).changes===1}
  async rateLimit(key:string,expires:number,limit:number){const row=this.db.prepare('INSERT INTO arena_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(key,expires) as {count:number};return row.count<=limit}
  due(now:number){return this.db.prepare("SELECT code,data,version,expires FROM arena_rooms WHERE expires>? AND json_extract(data,'$.answerDeadline')<=? AND json_extract(data,'$.phase') IN ('faceoff','play')").all(now,now) as Row[]}
  cleanup(now:number){this.db.prepare('DELETE FROM arena_rooms WHERE expires<=?').run(now);this.db.prepare('DELETE FROM arena_limits WHERE expires<=?').run(now)}
  close(){this.db.close()}
}
