import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fresh,reduce,expireTurn,view,ANSWER_MS,type Game} from '../lib/game.ts';
import {starterQuestions} from '../lib/sample.ts';
function room(){const g=fresh('ABCDEFGH','secret',starterQuestions,1000);for(const team of ['A','B'] as const)for(let n=1;n<=3;n++)g.players.push({id:team+n,name:team+n,team,hash:team+n});reduce(g,'start',{},'host',1000);return g}
function judge(g:Game,rank:number,now:number){reduce(g,'spoken',{text:'guess'},'host',now);reduce(g,'judge',{rank},'host',now)}
function playing(){const g=room();reduce(g,'buzz',{},'A1',1000);judge(g,0,2000);judge(g,1,3000);return g}

test('buzz starts exactly 45 seconds and each selected player gets a new deadline',()=>{
 const g=room();assert.equal(g.answerDeadline,null);assert.equal(expireTurn(g,999999),false);
 reduce(g,'buzz',{},'A1',1000);assert.equal(g.answerDeadline,46000);
 judge(g,0,3000);assert.equal(g.current,'B1');assert.equal(g.answerDeadline,48000);
 judge(g,1,5000);assert.equal(g.current,'A2');assert.equal(g.answerDeadline,50000);
});
test('timeout boundary is exact and an expired turn can only count once',()=>{
 const g=playing(),deadline=g.answerDeadline!;assert.equal(expireTurn(g,deadline-1),false);
 const oldId=g.turnId;assert.equal(expireTurn(g,deadline),true);assert.equal(g.misses,1);assert.equal(g.current,'A3');assert.notEqual(g.turnId,oldId);
 assert.equal(g.answerDeadline,deadline+ANSWER_MS);assert.equal(expireTurn(g,deadline),false);assert.equal(g.misses,1);
});
test('three timeouts rotate teammates then transfer to the opposing team',()=>{
 const g=playing();for(let i=0;i<3;i++)expireTurn(g,g.answerDeadline!);
 assert.equal(g.control,'B');assert.equal(g.current,'B2');assert.equal(g.misses,0);assert.equal(g.takeovers,1);
 for(let i=0;i<3;i++)expireTurn(g,g.answerDeadline!);assert.equal(g.control,'A');assert.equal(g.takeovers,2);
});
test('opening timeout passes to the opposing opener and two timeouts reopen the same buzzer pair',()=>{
 const g=room();reduce(g,'buzz',{},'A1',1000);expireTurn(g,46000);
 assert.equal(g.face.A,-1);assert.equal(g.current,'B1');assert.equal(g.answerDeadline,91000);
 expireTurn(g,91000);assert.equal(g.phase,'buzzer');assert.equal(g.answerDeadline,null);assert.deepEqual(g.earned,{A:0,B:0});
 assert.match(g.events.map(e=>e.text).join(' '),/Time expired/);
});
test('first correct opening answer survives second opener timeout and is visible to all players',()=>{
 const g=room();reduce(g,'buzz',{},'B1',1000);judge(g,2,2000);
 assert.equal(view(g,'A1').answers[2].text,g.questions[0].answers[2].text);assert.deepEqual(g.earned,{A:0,B:30});
 expireTurn(g,g.answerDeadline!);assert.equal(g.control,'B');assert.deepEqual(g.earned,{A:0,B:30});
});
test('submitting just before the deadline pauses the timer during unlimited host review',()=>{
 const g=playing(),deadline=g.answerDeadline!;reduce(g,'answer',{text:'my answer'},g.current!,deadline-1);
 assert.equal(g.answerDeadline,null);assert.equal(expireTurn(g,deadline+3600000),false);
 reduce(g,'judge',{rank:2},'host',deadline+3600000);assert.equal(g.answerDeadline,deadline+3600000+ANSWER_MS);
});
test('late player and spoken answers are rejected; refresh preserves the deadline',()=>{
 const g=playing(),deadline=g.answerDeadline!;
 assert.throws(()=>reduce(g,'answer',{text:'late'},g.current!,deadline),/expired/);
 assert.throws(()=>reduce(g,'spoken',{text:'late'},'host',deadline),/expired/);
 const restored:Game=JSON.parse(JSON.stringify(g));assert.equal(view(restored,'A2',deadline-1).answerDeadline,deadline);
 assert.equal(expireTurn(restored,deadline),true);
});
test('host override gives 45 seconds, ending the round cancels the timer',()=>{
 const g=playing();reduce(g,'turn',{player:'B3'},'host',10000);assert.equal(g.answerDeadline,55000);assert.equal(g.current,'B3');
 reduce(g,'end',{},'host',10001);assert.equal(g.answerDeadline,null);assert.equal(g.turnId,null);assert.equal(expireTurn(g,999999),false);
});
test('correct answers and manual misses reset the next timer without losing points',()=>{
 const g=playing();judge(g,2,10000);assert.equal(g.answerDeadline,55000);assert.equal(g.earned.A,80);
 judge(g,-1,15000);assert.equal(g.answerDeadline,60000);assert.equal(g.misses,1);assert.equal(g.earned.A,80);
});
test('a long disconnect advances one timeout and gives the next player a full turn',()=>{
 const g=playing();assert.equal(expireTurn(g,999999),true);assert.equal(g.misses,1);assert.equal(g.answerDeadline,999999+ANSWER_MS);
});
test('early ending during opening banks the immediately revealed answer once',()=>{
 const g=room();reduce(g,'buzz',{},'A1',1000);judge(g,0,2000);reduce(g,'end',{},'host',3000);
 assert.deepEqual(g.scores,{A:50,B:0});assert.deepEqual(view(g,'A1').liveScores,{A:50,B:0});assert.equal(g.answerDeadline,null);
});
