import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buzzerPlayer,fresh,reduce,view} from '../lib/game.ts';
import {starterQuestions} from '../lib/sample.ts';

function room(count=3){
 const g=fresh('ABCDEFGH','secret',structuredClone(starterQuestions));
 for(let i=1;i<=count;i++)for(const team of ['A','B'] as const)g.players.push({id:`${team}${i}`,name:`${team} Player ${i}`,team,hash:`${team}${i}-hash`});
 reduce(g,'start',{},'host');return g;
}
function answer(g:ReturnType<typeof room>,rank:number){reduce(g,'answer',{text:'a spoken guess'},g.current!);reduce(g,'judge',{rank},'host')}

test('all 15 rounds rotate by roster size; only the designated pair can buzz',()=>{
 for(const size of [1,2,3,4,5,20]){
  const g=room(size);
  for(let round=0;round<15;round++){
   const number=round%size+1;
   assert.equal(buzzerPlayer(g,'A')?.id,`A${number}`);
   assert.equal(buzzerPlayer(g,'B')?.id,`B${number}`);
   for(const p of g.players)if(p.id!==`A${number}`&&p.id!==`B${number}`)assert.throws(()=>reduce(g,'buzz',{},p.id),/designated/);
   const first=round%2?'B':'A',second=first==='A'?'B':'A';
   reduce(g,'buzz',{},`${first}${number}`);assert.equal(g.current,`${first}${number}`);
   assert.throws(()=>reduce(g,'buzz',{},`${second}${number}`),/claimed/);
   answer(g,0);assert.equal(g.current,`${second}${number}`);
   answer(g,1);assert.equal(g.control,first);
   reduce(g,'end',{},'host');reduce(g,'next',{},'host');
  }
  assert.equal(g.phase,'finished');
 }
});

test('ties reopen for the same pair; ineligible players and wrong answerers are rejected',()=>{
 const g=room();g.round=1;
 reduce(g,'buzz',{},'A2');assert.throws(()=>reduce(g,'answer',{text:'guess'},'A1'),/Wait/);
 answer(g,-1);assert.equal(g.current,'B2');answer(g,-1);
 assert.equal(g.phase,'buzzer');assert.equal(g.firstTeam,null);
 assert.throws(()=>reduce(g,'buzz',{},'A3'),/designated/);
 reduce(g,'buzz',{},'B2');assert.equal(g.current,'B2');
});

test('host can override the buzzer and answering player; next round follows the original rotation',()=>{
 const g=room();
 assert.throws(()=>reduce(g,'turn',{player:'A3'},'A1'),/Only the host/);
 reduce(g,'turn',{player:'A3'},'host');assert.equal(g.phase,'faceoff');assert.equal(g.current,'A3');
 reduce(g,'turn',{player:'A2'},'host');assert.equal(g.current,'A2');
 reduce(g,'answer',{text:'guess'},'A2');assert.throws(()=>reduce(g,'turn',{player:'A1'},'host'),/pending/);
 reduce(g,'judge',{rank:0},'host');assert.equal(g.current,'B1');
 assert.throws(()=>reduce(g,'turn',{player:'A1'},'host'),/already/);
 answer(g,1);assert.equal(g.control,'A');
 reduce(g,'turn',{player:'B3'},'host');assert.equal(g.current,'B3');assert.equal(g.control,'B');assert.equal(g.takeovers,1);assert.equal(g.misses,0);
 reduce(g,'turn',{player:'B2'},'host');assert.equal(g.takeovers,1);
 reduce(g,'end',{},'host');reduce(g,'next',{},'host');assert.equal(buzzerPlayer(g,'A')?.id,'A2');
});

test('numbering follows lobby changes and views disclose eligibility without secret answers',()=>{
 const g=room();g.phase='lobby';
 reduce(g,'assign',{player:'A1',team:'B'},'host');reduce(g,'remove',{player:'B3'},'host');
 const state=view(g,'A2');assert.equal(state.players.find(p=>p.id==='A2')?.number,1);
 assert.equal(state.players.find(p=>p.id==='A1')?.number,1);
 assert.equal(state.buzzerPlayers.A,'A2');assert.equal(state.questions,undefined);
 assert.ok(state.answers.every(a=>a.text===null));assert.ok(state.players.every(p=>!('hash' in p)));
 const restored=JSON.parse(JSON.stringify(g));assert.equal(buzzerPlayer(restored,'A')?.id,'A2');
});
