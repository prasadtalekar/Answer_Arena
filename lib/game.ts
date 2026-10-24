export type Team = 'A' | 'B';
export type Question = {question: string; answers: {text: string; aliases: string[]}[]};
export type Player = {id: string; name: string; team: Team; hash: string};
export type Game = {
  code: string; hostHash: string; created: number; players: Player[]; questions: Question[];
  phase: 'lobby' | 'buzzer' | 'faceoff' | 'play' | 'roundEnd' | 'finished';
  round: number; scores: Record<Team, number>; earned: Record<Team, number>;
  revealed: number[]; face: Partial<Record<Team, number>>;
  firstTeam: Team | null; control: Team | null; current: string | null;
  cursor: Record<Team, number>; misses: number; takeovers: number;
  pending: {text: string; player: string} | null;
  answerDeadline: number | null; turnId: string | null;
  events: {id: string; text: string}[]; result: string; recent: string[];
};
export const ANSWER_MS = 45_000;
export const isDoubleWipeout = (round: number) => round % 5 >= 3;
export const points = [50, 40, 30, 20, 10];
export function check(ok: unknown, message: string): asserts ok {if (!ok) throw new Error(message)}
export const other = (t: Team): Team => t === 'A' ? 'B' : 'A';
export const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function validateQuestions(value: unknown): Question[] {
  check(Array.isArray(value) && value.length === 15, 'Provide exactly fifteen rounds.');
  return value.map(q => {
    check(typeof q.question === 'string' && q.question.trim().length > 3 && q.question.length <= 220, 'Each question needs 4–220 characters.');
    check(Array.isArray(q.answers) && q.answers.length === 5, 'Each round needs five answers.');
    const seen = new Set<string>();
    return {question: q.question.trim(), answers: q.answers.map((a: {text: string; aliases: string[]}) => {
      check(typeof a.text === 'string' && a.text.trim().length > 0 && a.text.length <= 80, 'Answers need 1–80 characters.');
      check(Array.isArray(a.aliases) && a.aliases.length <= 10 && a.aliases.every(v => typeof v === 'string' && v.length > 0 && v.length <= 80), 'Use up to 10 short aliases.');
      // Equivalent aliases of the SAME answer are harmless; cross-answer collisions are not.
      const own = new Set<string>();
      for (const s of [a.text, ...a.aliases]) {const n = norm(s); check(n && (!seen.has(n) || own.has(n)), 'Answers and aliases must be distinct within a round.'); seen.add(n); own.add(n)}
      return {text: a.text.trim(), aliases: [...new Set(a.aliases.map(a => a.trim()))]};
    })};
  });
}
export function event(g: Game, text: string) {g.events.unshift({id: crypto.randomUUID(), text}); g.events = g.events.slice(0, 40)}
export function fresh(code: string, hostHash: string, questions: Question[], now = Date.now()): Game {
  return {code, hostHash, questions, created: now, players: [], phase: 'lobby', round: 0,
    scores: {A: 0, B: 0}, earned: {A: 0, B: 0}, revealed: [], face: {}, firstTeam: null,
    control: null, current: null, cursor: {A: 0, B: 0}, misses: 0, takeovers: 0,
    pending: null, answerDeadline: null, turnId: null, events: [], result: '', recent: []};
}
export function buzzerPlayer(g: Game, t: Team) {const roster = g.players.filter(p => p.team === t); return roster.length ? roster[g.round % roster.length] : null}
function clearTurn(g: Game) {g.current = null; g.answerDeadline = null; g.turnId = null}
function selectPlayer(g: Game, p: Player, now: number) {
  const roster = g.players.filter(member => member.team === p.team);
  g.current = p.id; g.cursor[p.team] = (roster.findIndex(member => member.id === p.id) + 1) % roster.length;
  g.answerDeadline = now + ANSWER_MS; g.turnId = crypto.randomUUID();
}
function pick(g: Game, t: Team, now: number) {
  const roster = g.players.filter(p => p.team === t); check(roster.length, 'This team has no players.');
  selectPlayer(g, roster[g.cursor[t] % roster.length], now);
}
function startRound(g: Game) {
  g.phase = 'buzzer'; g.earned = {A: 0, B: 0}; g.revealed = []; g.face = {}; g.firstTeam = null;
  g.control = null; clearTurn(g); g.misses = 0; g.takeovers = 0; g.pending = null; g.result = '';
  for (const t of ['A', 'B'] as Team[]) g.cursor[t] = g.round % Math.max(1, g.players.filter(p => p.team === t).length);
  event(g, `Round ${g.round + 1}: buzzers open for ${buzzerPlayer(g, 'A')?.name} and ${buzzerPlayer(g, 'B')?.name}.`);
}
function settle(g: Game, cleared: boolean) {
  if (cleared && g.takeovers > 0 && g.control) {
    const multiplier = isDoubleWipeout(g.round) ? 2 : 1;
    const total = (g.earned.A + g.earned.B) * multiplier; g.scores[g.control] += total;
    g.result = `WIPE OUT! Team ${g.control} takes ${total} points${multiplier === 2 ? ' — double points!' : ''}.`;
  } else {
    g.scores.A += g.earned.A; g.scores.B += g.earned.B;
    g.result = `Round banked: Team A +${g.earned.A} · Team B +${g.earned.B}.`;
  }
  g.phase = 'roundEnd'; g.pending = null; clearTurn(g); event(g, g.result);
}
function switchTeam(g: Game, t: Team, now: number) {
  g.control = t; g.misses = 0; g.pending = null; g.takeovers++; pick(g, t, now);
  event(g, `Control passes to Team ${t}. Three fresh chances.`);
}
function judge(g: Game, rank: number, now: number) {
  check(g.phase === 'faceoff' || g.phase === 'play', 'Answers are not open.');
  check(g.pending, 'Enter or submit an answer first.');
  check(Number.isInteger(rank) && rank >= -1 && rank < 5, 'Choose a valid answer.');
  const p = g.players.find(p => p.id === g.current); check(p, 'Assign a player first.');
  if (rank >= 0) check(!g.revealed.includes(rank), 'That answer is already revealed. Count a miss instead.');
  const text = g.pending.text; g.pending = null;
  if (g.phase === 'faceoff') {
    g.face[p.team] = rank;
    if (rank >= 0) {
      g.revealed.push(rank); g.earned[p.team] += points[rank];
      event(g, `${p.name} reveals ${g.questions[g.round].answers[rank].text}: +${points[rank]}.`);
    } else event(g, `${p.name}: “${text}” — opening miss.`);
    if (g.face.A === undefined || g.face.B === undefined) {
      const opponent = buzzerPlayer(g, other(p.team)); check(opponent, 'The other team needs a player.');
      selectPlayer(g, opponent, now); return;
    }
    const a = g.face.A, b = g.face.B;
    if (a < 0 && b < 0) {g.face = {}; g.phase = 'buzzer'; clearTurn(g); g.firstTeam = null; event(g, 'Both opening answers missed. The same two players buzz again.'); return}
    const winner: Team = a < 0 ? 'B' : b < 0 ? 'A' : a < b ? 'A' : 'B';
    g.control = winner; g.phase = 'play'; pick(g, winner, now);
    event(g, `Team ${winner} wins control with the higher-ranked answer.`); return;
  }
  if (rank < 0) {
    g.misses++; event(g, `${p.name}: “${text}” — miss ${g.misses}/3.`);
    if (g.misses >= 3) switchTeam(g, other(p.team), now); else pick(g, p.team, now);
  } else {
    g.revealed.push(rank); g.earned[p.team] += points[rank];
    event(g, `${p.name} reveals ${g.questions[g.round].answers[rank].text}: +${points[rank]}.`);
    if (g.revealed.length === 5) settle(g, true); else pick(g, p.team, now);
  }
}
// Called before every authenticated read/write, and by the standalone server's sweep.
// One expiry advances one turn. The next player gets 45 real seconds from processing time,
// so reconnecting after a long pause cannot cascade through the whole team instantly.
export function expireTurn(g: Game, now = Date.now()): boolean {
  if (!['faceoff', 'play'].includes(g.phase) || g.pending || g.answerDeadline == null || now < g.answerDeadline || !g.current) return false;
  g.pending = {text: 'Time expired (45 seconds)', player: g.current};
  judge(g, -1, now); return true;
}
export function reduce(g: Game, action: string, data: Record<string, any>, actor: string, now = Date.now()) {
  const host = actor === 'host', p = g.players.find(p => p.id === actor);
  if (action === 'buzz') {
    check(p, 'Only players can buzz.'); check(g.phase === 'buzzer', 'The buzzer has already been claimed or is closed.');
    check(buzzerPlayer(g, p.team)?.id === p.id, 'Only your team’s designated player can buzz this round.');
    g.firstTeam = p.team; selectPlayer(g, p, now); g.phase = 'faceoff'; event(g, `${p.name} buzzed first for Team ${p.team}.`); return;
  }
  if (action === 'answer') {
    check(p && g.current === p.id, 'Wait for your turn.'); check(g.phase === 'faceoff' || g.phase === 'play', 'Answers are closed.');
    check(!g.pending, 'Your answer is awaiting the host.');
    check(g.answerDeadline != null && now < g.answerDeadline, 'Your answer time has expired.');
    check(typeof data.text === 'string' && data.text.trim() && data.text.length <= 160, 'Enter a short answer.');
    g.pending = {text: data.text.trim(), player: p.id}; g.answerDeadline = null; return;
  }
  check(host, 'Only the host can do this.');
  switch (action) {
    case 'questions': check(g.phase === 'lobby', 'Questions are locked once the game starts.'); g.questions = validateQuestions(data.questions); event(g, 'The host updated the fifteen rounds.'); break;
    case 'assign': {
      check(g.phase === 'lobby', 'Teams are locked during play.'); check(data.team === 'A' || data.team === 'B', 'Choose Team A or B.');
      const member = g.players.find(p => p.id === data.player); check(member, 'Player not found.'); member.team = data.team; break;
    }
    case 'remove': check(g.phase === 'lobby', 'Players can only be removed in the lobby.'); g.players = g.players.filter(p => p.id !== data.player); break;
    case 'start': check(g.phase === 'lobby', 'The game has already started.'); check(g.players.length >= 2 && g.players.filter(p => p.team === 'A').length === g.players.filter(p => p.team === 'B').length, 'Add at least one player per team and make team sizes equal.'); startRound(g); break;
    case 'next': check(g.phase === 'roundEnd', 'Finish this round first.'); if (g.round === g.questions.length - 1) {g.phase = 'finished'; clearTurn(g); event(g, 'All rounds complete. Thanks for playing!')} else {g.round++; startRound(g)} break;
    case 'turn': {
      check(['buzzer', 'play', 'faceoff'].includes(g.phase), 'No answer turn is active.'); check(!g.pending, 'Judge the pending answer first.');
      const target = g.players.find(p => p.id === data.player); check(target, 'Player not found.');
      if (g.phase === 'buzzer') {g.firstTeam = target.team; g.phase = 'faceoff'}
      else if (g.phase === 'faceoff') check(g.face[target.team] === undefined, 'That team has already given its opening answer.');
      else if (target.team !== g.control) switchTeam(g, target.team, now);
      selectPlayer(g, target, now); event(g, `The host gives the next answer to ${target.name} (Team ${target.team}).`); break;
    }
    case 'rotate': check(g.phase === 'play', 'Control can change after the opening face-off.'); check(!g.pending, 'Judge the pending answer first.'); switchTeam(g, other(g.control!), now); break;
    case 'spoken':
      check(g.phase === 'play' || g.phase === 'faceoff', 'Answers are closed.'); check(!g.pending, 'Judge the pending answer first.');
      check(g.answerDeadline != null && now < g.answerDeadline, 'The answer time has expired.');
      check(typeof data.text === 'string' && data.text.trim() && data.text.length <= 160, 'Enter a short answer.');
      g.pending = {text: data.text.trim(), player: g.current!}; g.answerDeadline = null; break;
    case 'judge': judge(g, data.rank, now); break;
    case 'end': check(['play', 'faceoff', 'buzzer'].includes(g.phase), 'No round is active.'); settle(g, false); break;
    case 'adjust':
      check(data.team === 'A' || data.team === 'B', 'Choose a team.');
      check(Number.isInteger(data.points) && Math.abs(data.points) <= 1000 && data.points !== 0, 'Enter a non-zero whole number from -1000 to 1000.');
      check(typeof data.reason === 'string' && data.reason.trim().length >= 3 && data.reason.length <= 120, 'Add a reason for the adjustment.');
      g.scores[data.team as Team] += data.points; event(g, `Host adjustment: Team ${data.team} ${data.points > 0 ? '+' : ''}${data.points}. ${data.reason.trim()}`); break;
    default: throw new Error('Unknown action.');
  }
}
export function liveScores(g: Game): Record<Team, number> {
  const active = g.phase === 'faceoff' || g.phase === 'play';
  return {A: g.scores.A + (active ? g.earned.A : 0), B: g.scores.B + (active ? g.earned.B : 0)};
}
export function view(g: Game, actor: string, now = Date.now()) {
  const host = actor === 'host', q = g.questions[g.round];
  return {totalRounds: g.questions.length, code: g.code, phase: g.phase, round: g.round, scores: g.scores,
    liveScores: liveScores(g), earned: g.earned, revealed: g.revealed, control: g.control, current: g.current,
    answerDeadline: g.answerDeadline, turnId: g.turnId, serverNow: now,
    misses: g.misses, takeovers: g.takeovers, pending: g.pending, events: g.events, result: g.result,
    firstTeam: g.firstTeam, buzzerPlayers: {A: buzzerPlayer(g, 'A')?.id ?? null, B: buzzerPlayer(g, 'B')?.id ?? null},
    players: g.players.map(({hash, ...p}) => ({...p, number: g.players.filter(member => member.team === p.team).findIndex(member => member.id === p.id) + 1})),
    question: g.phase === 'lobby' ? null : q.question,
    answers: q.answers.map((a, i) => ({rank: i, points: points[i], text: host || g.revealed.includes(i) || g.phase === 'roundEnd' || g.phase === 'finished' ? a.text : null})),
    questions: host ? g.questions : undefined, face: host ? g.face : undefined,
    suggested: host && g.pending ? q.answers.findIndex(a => [a.text, ...a.aliases].some(s => norm(s) === norm(g.pending!.text))) : undefined,
    role: host ? 'host' : 'player', me: host ? null : actor};
}
