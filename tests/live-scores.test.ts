import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fresh,liveScores,reduce,view,validateQuestions} from '../lib/game.ts';
import {samples,starterQuestions} from '../lib/sample.ts';

function room(){
 const g=fresh('ABCDEFGH','secret',structuredClone(starterQuestions));
 for(const team of ['A','B'] as const)g.players.push({id:team,name:team,team,hash:team+'-hash'});
 reduce(g,'start',{},'host');return g;
}
function answer(g:ReturnType<typeof room>,rank:number){reduce(g,'answer',{text:'guess'},g.current!);reduce(g,'judge',{rank},'host')}
function open(g=room()){reduce(g,'buzz',{},'A');answer(g,0);answer(g,1);return g}

test('first opening correct answer updates both roles before the other answer',()=>{
 const g=room();reduce(g,'buzz',{},'A');reduce(g,'answer',{text:'guess'},'A');
 assert.deepEqual(liveScores(g),{A:0,B:0});reduce(g,'judge',{rank:0},'host');
 assert.deepEqual(liveScores(g),{A:50,B:0});assert.deepEqual(g.scores,{A:0,B:0});
 assert.deepEqual(view(g,'host').liveScores,view(g,'B').liveScores);
 assert.equal(view(g,'B').answers[0].text,g.questions[0].answers[0].text);assert.ok(view(g,'B').answers.slice(1).every(a=>a.text===null));
 answer(g,1);assert.deepEqual(liveScores(g),{A:50,B:40});
});

test('two opening misses reopen the buzzer without altering banked scores',()=>{
 for(const rank of [-1]){
  const g=room();g.scores={A:100,B:70};reduce(g,'buzz',{},'A');answer(g,rank);
  assert.deepEqual(liveScores(g),{A:100+(rank<0?0:50-rank*10),B:70});
  answer(g,rank);assert.equal(g.phase,'buzzer');assert.deepEqual(liveScores(g),{A:100,B:70});
 }
});

test('correct answers add live points, wrong answers add strikes, three misses transfer control',()=>{
 const g=open();answer(g,2);assert.deepEqual(liveScores(g),{A:80,B:40});
 for(let miss=1;miss<=3;miss++){
  answer(g,-1);assert.deepEqual(liveScores(g),{A:80,B:40});
  assert.equal(g.misses,miss===3?0:miss);
 }
 assert.equal(g.control,'B');assert.equal(g.current,'B');assert.equal(g.takeovers,1);
});

test('clearing without takeover banks once and resets the next round live tally',()=>{
 const g=open();g.scores={A:100,B:70};for(const rank of [2,3,4])answer(g,rank);
 assert.equal(g.phase,'roundEnd');assert.deepEqual(liveScores(g),{A:210,B:110});
 assert.deepEqual(g.scores,{A:210,B:110});reduce(g,'next',{},'host');
 assert.deepEqual(liveScores(g),{A:210,B:110});assert.deepEqual(g.earned,{A:0,B:0});
});

test('all 15 rounds settle standard and double wipeouts to the takeover winner exactly once',()=>{
 for(let round=0;round<15;round++){
  const g=room();g.round=round;reduce(g,'buzz',{},'A');answer(g,0);answer(g,1);
  reduce(g,'turn',{player:'B'},'host');
  answer(g,2);assert.deepEqual(liveScores(g),{A:50,B:70});
  answer(g,3);assert.deepEqual(liveScores(g),{A:50,B:90});answer(g,4);
  const expected=[3,4,8,9,13,14].includes(round)?300:150;
  assert.equal(g.phase,'roundEnd');assert.deepEqual(liveScores(g),{A:0,B:expected});
  assert.deepEqual(g.scores,{A:0,B:expected});
 }
});

test('host-ended rounds bank only earned points even in a double wipeout round',()=>{
 const g=open();g.round=3;reduce(g,'turn',{player:'B'},'host');answer(g,2);
 reduce(g,'end',{},'host');assert.deepEqual(liveScores(g),{A:50,B:70});
 assert.deepEqual(g.scores,{A:50,B:70});
});

test('host adjustments appear immediately; unauthorized score and turn actions are rejected',()=>{
 const g=open();reduce(g,'adjust',{team:'A',points:-20,reason:'Correction'},'host');
 assert.deepEqual(liveScores(g),{A:30,B:40});
 for(const action of ['questions','assign','remove','start','next','turn','rotate','spoken','judge','end','adjust'])assert.throws(()=>reduce(g,action,{},'A'),/Only the host/);
 reduce(g,'end',{},'host');assert.deepEqual(liveScores(g),{A:30,B:40});
 g.round=14;reduce(g,'next',{},'host');assert.equal(g.phase,'finished');assert.deepEqual(liveScores(g),{A:30,B:40});
});

test('all question-bank alternatives validate and duplicate revealed ranks cannot add points',()=>{
 for(let i=0;i<samples.length;i++)validateQuestions([...samples.slice(i),...samples].slice(0,15));
 const g=open();reduce(g,'answer',{text:'guess'},g.current!);const before=liveScores(g);
 assert.throws(()=>reduce(g,'judge',{rank:0},'host'),/already revealed/);assert.deepEqual(liveScores(g),before);
 assert.ok(g.pending);reduce(g,'judge',{rank:-1},'host');assert.equal(g.misses,1);
});
