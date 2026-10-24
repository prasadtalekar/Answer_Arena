import type {Store,Row} from './store.ts';
import type {Game} from '../lib/game.ts';
export class D1Store implements Store {
  db:D1DatabaseSession;
  constructor(db:D1Database){this.db=db.withSession('first-primary')}
  async read(code:string){return this.db.prepare('SELECT code,data,version,expires FROM arena_rooms WHERE code=?').bind(code).first<Row>()}
  async insert(g:Game){await this.db.prepare('INSERT INTO arena_rooms(code,data,version,expires) VALUES(?,?,0,?)').bind(g.code,JSON.stringify(g),g.created+86400000).run()}
  async save(g:Game,version:number){const r=await this.db.prepare('UPDATE arena_rooms SET data=?,version=version+1 WHERE code=? AND version=?').bind(JSON.stringify(g),g.code,version).run();return r.meta.changes===1}
  async rateLimit(key:string,expires:number,limit:number){const r=await this.db.prepare('INSERT INTO arena_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,expires).first<{count:number}>();return !!r&&r.count<=limit}
}
