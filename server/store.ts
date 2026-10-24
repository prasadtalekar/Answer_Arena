import type {Game} from '../lib/game.ts';
export type Row = {code:string; data:string; version:number; expires:number};
export interface Store {
  read(code:string):Promise<Row|null>;
  insert(g:Game):Promise<void>;
  save(g:Game,version:number):Promise<boolean>;
  rateLimit(key:string,expires:number,limit:number):Promise<boolean>;
}
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS arena_rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS arena_rooms_expires ON arena_rooms(expires);
CREATE TABLE IF NOT EXISTS arena_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS arena_limits_expires ON arena_limits(expires);
`;
