'use strict';
/* ORB BRAWL — a mini MOBA-style lane card battler. No dependencies.
 *
 * Board: 3 long lanes (5 tiles each) with jungle strips between them.
 * Row 0 is the enemy's home tile, row 4 is yours. Creatures are summoned on
 * your home tile, then marched up the lane. Hidden traps go in the jungle and
 * spring on enemies that step onto an adjacent lane tile.
 */

const MAX_ORB = 20, HAND_MAX = 7, DECK_SIZE = 30, MAX_MANA = 10;
const ROWS = 5;
const HOME = { p: ROWS - 1, e: 0 };          // summon row
const DIR = { p: -1, e: 1 };                 // row direction of "forward"
const FRONT = { p: 0, e: ROWS - 1 };         // row adjacent to the enemy orb
const KW = {
  swift: ['⚡', 'Swift: +1 move, and can attack the turn it is played.'],
  ward:  ['🛡', 'Ward: ignores the first damage it takes.'],
  life:  ['💚', 'Lifelink: heals your orb when it deals damage.'],
  range: ['🏹', 'Ranged: strikes 2 tiles away and is only hit back by other ranged units.'],
};

// [id, name, icon, cost, atk, hp, keywords]
const CREATURES = [
  ['sprite',  'Ember Sprite',     '🔥', 1, 2, 1, ['swift']],
  ['imp',     'Sewer Imp',        '👺', 1, 1, 3, []],
  ['wolf',    'Barrow Wolf',      '🐺', 2, 3, 2, []],
  ['rune',    'Rune Apprentice',  '🧙', 2, 2, 3, []],
  ['cleric',  'Hearth Cleric',    '🕯️', 2, 1, 3, ['life']],
  ['slinger', 'Goblin Slinger',   '🎯', 2, 2, 2, ['range']],
  ['orc',     'Orc Brawler',      '👹', 3, 4, 3, []],
  ['ranger',  'Moon Elf Ranger',  '🧝', 3, 3, 3, ['range']],
  ['knight',  'Aegis Knight',     '🛡️', 3, 2, 4, ['ward']],
  ['troll',   'Stone Troll',      '🗿', 4, 5, 5, []],
  ['wraith',  'Neon Wraith',      '👻', 4, 4, 3, ['swift']],
  ['paladin', 'Dawn Paladin',     '⚔️', 4, 3, 5, ['life']],
  ['wyrm',    'Frost Wyrm',       '🐉', 5, 6, 5, []],
  ['ogre',    'Raid Boss Ogre',   '🦍', 5, 5, 7, []],
  ['treant',  'Ancient Treant',   '🌳', 6, 7, 7, ['ward']],
  ['dragon',  'Spire Dragon',     '🐲', 7, 8, 6, ['swift']],
  ['titan',   'Siege Titan',      '🏰', 8, 9, 10, []],
].map(([id, name, icon, cost, atk, hp, kw]) => ({ type: 'c', id, name, icon, cost, atk, hp, kw }));

const o = s => (s === 'p' ? 'e' : 'p');
const moveOf = c => (c.kw.includes('swift') ? 3 : 2);
const reachOf = c => (c.kw.includes('range') ? 2 : 1);

const aiKill = (c, n) => {
  if (!c || c.hp <= 0) return -1;
  if (c.ward) return 0.8;
  return c.hp <= n ? 3 + c.atk + c.hp * 0.5 : n * 0.4;
};

// t: target kind — 'enemy' creature, 'ally' creature, 'orb' (enemy), 'jungle' (trap), 'none'
const SPELLS = [
  { id: 'bolt', name: 'Arcane Bolt', icon: '✨', cost: 1, t: 'enemy', text: 'Deal 2 damage to an enemy creature.',
    fx: (s, c) => hurt(c, 2), ai: (s, c) => aiKill(c, 2) },
  { id: 'fire', name: 'Fireball', icon: '☄️', cost: 3, t: 'enemy', text: 'Deal 5 damage to an enemy creature.',
    fx: (s, c) => hurt(c, 5), ai: (s, c) => aiKill(c, 5) - 1 },
  { id: 'void', name: 'Void Bolt', icon: '🌀', cost: 3, t: 'orb', text: 'Deal 3 damage to the enemy orb.',
    fx: s => orbHit(o(s), 3), ai: s => (G[o(s)].orb <= 3 ? 50 : 2.2) },
  { id: 'mend', name: 'Mend', icon: '💖', cost: 2, t: 'none', text: 'Restore 4 to your orb.',
    fx: s => heal(s, 4), ai: s => (MAX_ORB - G[s].orb >= 4 ? (MAX_ORB - G[s].orb) / 2 : -1) },
  { id: 'cry', name: 'Battle Cry', icon: '📯', cost: 2, t: 'ally', text: 'An allied creature gets +2/+1.',
    fx: (s, c) => buff(c, 2, 1), ai: (s, c) => 1.5 + c.atk * 0.5 },
  { id: 'wardrune', name: 'Ward Rune', icon: '🔰', cost: 1, t: 'ally', text: 'An allied creature gains Ward.',
    fx: (s, c) => { c.ward = true; float(cellEl(c.l, c.r), '🛡', 'buff'); },
    ai: (s, c) => (c.ward ? -1 : 1 + c.atk * 0.4) },
  { id: 'storm', name: 'Lightning Storm', icon: '⛈️', cost: 4, t: 'none', text: 'Deal 2 damage to ALL enemy creatures.',
    fx: s => creatures(o(s)).forEach(c => hurt(c, 2)),
    ai: s => { const cs = creatures(o(s)); return cs.length >= 2 ? cs.length * 2.2 + cs.filter(c => c.hp <= 2).length * 2 : -1; } },
  // traps: placed face-down in the jungle; spring when an enemy steps on an adjacent lane tile
  { id: 'snare', name: 'Snare Trap', icon: '🪤', cost: 2, t: 'jungle', trap: true,
    text: 'Hidden trap. Enemy that steps beside it takes 1 and is frozen for 2 turns.',
    trig: async (own, c) => { hurt(c, 1); c.frozen = 2; }, ai: () => 2.6 },
  { id: 'spike', name: 'Spike Pit', icon: '🕳️', cost: 2, t: 'jungle', trap: true,
    text: 'Hidden trap. Enemy that steps beside it takes 3 damage and must stop.',
    trig: async (own, c) => { hurt(c, 3); }, ai: () => 2.8 },
  { id: 'siphon', name: 'Siphon Rune', icon: '🔮', cost: 1, t: 'jungle', trap: true,
    text: 'Hidden trap. Enemy that steps beside it takes 2 and you restore 2 to your orb.',
    trig: async (own, c) => { hurt(c, 2); await heal(own, 2); }, ai: () => 2.2 },
].map(sp => ({ ...sp, type: 's', kw: [] }));

const POOL = [...CREATURES, ...SPELLS];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
const cellEl = (l, r) => document.querySelector(`[data-cell="${l}-${r}"]`);
const orbEl = s => $('#orb-' + s);
const at = (l, r) => (r >= 0 && r < ROWS ? G.board[l][r] : null);

let G;

function creatures(s) {
  const out = [];
  for (const lane of G.board) for (const c of lane) if (c && c.side === s) out.push(c);
  return out;
}
// creatures ordered front-most first
const byFront = s => creatures(s).sort((a, b) => (s === 'p' ? a.r - b.r : b.r - a.r));

function buildDeck() {
  const bag = shuffle([...POOL, ...POOL]);
  const deck = [], count = {};
  for (const c of bag) {
    if (deck.length >= DECK_SIZE) break;
    if ((count[c.id] || 0) >= 2) continue;
    count[c.id] = (count[c.id] || 0) + 1;
    deck.push(c);
  }
  return deck.map(c => ({ ...c, uid: Math.random() }));
}

function mkSide() {
  return { orb: MAX_ORB, shown: MAX_ORB, mana: 0, max: 0, deck: buildDeck(), hand: [] };
}

/* ---------- game flow ---------- */
async function newGame() {
  G = { p: mkSide(), e: mkSide(), turn: 'p', round: 0, busy: true, over: false, sel: null, mv: null, insp: null, msg: '',
    board: Array.from({ length: 3 }, () => Array(ROWS).fill(null)),
    traps: Array.from({ length: 2 }, () => Array(ROWS).fill(null)) };
  for (const s of ['p', 'e']) {
    const P = G[s];
    for (let i = 0; i < (s === 'e' ? 5 : 4); i++) P.hand.push(P.deck.pop());
    if (!P.hand.some(c => c.cost <= 2 && c.type === 'c')) { // guarantee a playable opener
      const k = P.deck.findIndex(c => c.cost <= 2 && c.type === 'c');
      if (k >= 0) P.hand[0] = P.deck.splice(k, 1)[0];
    }
  }
  $('#overlay').hidden = true;
  await startTurn('p');
}

async function startTurn(s) {
  const P = G[s];
  G.turn = s; G.insp = null; G.sel = null; G.mv = null;
  if (s === 'p') G.round++;
  P.max = Math.min(MAX_MANA, P.max + 1);
  P.mana = P.max;
  creatures(s).forEach(c => { c.sick = false; c.mv = moveOf(c); });
  await draw(s);
  if (G.over) return;
  if (s === 'p') { G.busy = false; G.msg = `Turn ${G.round} — summon, march, or set a trap!`; render(); }
  else { G.msg = 'Opponent is thinking…'; render(); await aiTurn(); }
}

async function draw(s) {
  const P = G[s];
  if (!P.deck.length) { G.msg = `${s === 'p' ? 'You are' : 'Foe is'} out of cards! Fatigue!`; render(); await orbHit(s, 1); checkOver(); return; }
  const c = P.deck.pop();
  if (P.hand.length < HAND_MAX) P.hand.push(c);
  render();
}

async function endTurn(s) {
  G.busy = true; G.sel = null; G.insp = null; G.mv = null;
  G.msg = s === 'p' ? 'Your creatures attack!' : 'The enemy attacks!';
  render();
  for (const c of byFront(s)) { if (c.hp > 0 && await attack(c)) return; }
  creatures(s).forEach(c => { if (c.frozen > 0) c.frozen--; });
  await startTurn(o(s));
}

async function attack(c) {
  if (c.hp <= 0 || c.sick || c.frozen > 0) return false;
  const s = c.side, reach = reachOf(c);
  let target = null, dist = 0;
  for (let d = 1; d <= reach; d++) {
    const t = at(c.l, c.r + DIR[s] * d);
    if (t && t.side !== s && t.hp > 0) { target = t; dist = d; break; }
  }
  const orbDist = Math.abs(c.r - FRONT[s]) + 1;
  if (!target && orbDist > reach) return false;

  const el = cellEl(c.l, c.r) && cellEl(c.l, c.r).firstElementChild;
  el && el.classList.add(s === 'p' ? 'lunge-up' : 'lunge-down');
  await sleep(160);
  if (target) {
    const back = target.atk, canBack = reachOf(target) >= dist;
    const dealt = hurt(target, c.atk);
    if (canBack) hurt(c, back);
    render();
    if (dealt > 0 && c.kw.includes('life') && c.hp > 0) await heal(s, dealt);
    await sleep(350);
    await settle();
  } else {
    await orbHit(o(s), c.atk);
    if (c.kw.includes('life')) await heal(s, c.atk);
    await sleep(150);
  }
  return checkOver();
}

/* ---------- movement & traps ---------- */
function reachable(c) {
  const out = [];
  if (!c || c.frozen > 0 || c.mv <= 0) return out;
  for (const step of [-1, 1]) {
    for (let d = 1; d <= c.mv; d++) {
      const r = c.r + step * d;
      if (r < 0 || r >= ROWS || at(c.l, r)) break;
      out.push(r);
    }
  }
  return out;
}

async function moveTo(c, nr) {
  const step = Math.sign(nr - c.r);
  while (c.r !== nr && c.mv > 0 && c.hp > 0) {
    const r2 = c.r + step;
    if (at(c.l, r2)) break;
    G.board[c.l][c.r] = null; c.r = r2; G.board[c.l][r2] = c; c.mv--; c.fresh = true;
    render();
    await sleep(220);
    if (await springTraps(c)) break;
  }
}

async function springTraps(c) {
  for (const j of [c.l - 1, c.l]) {
    if (j < 0 || j > 1) continue;
    const trap = G.traps[j][c.r];
    if (!trap || trap.owner === c.side) continue;
    G.traps[j][c.r] = null;
    c.mv = 0;
    G.msg = `${trap.def.name} sprung on ${c.name}!`;
    float(jungleEl(j, c.r), trap.def.icon + '💥', 'dmg');
    buzz(40);
    render();
    await sleep(350);
    await trap.def.trig(trap.owner, c);
    render();
    await sleep(350);
    await settle();
    return true;
  }
  return false;
}
const jungleEl = (j, r) => document.querySelector(`[data-jungle="${j}-${r}"]`);

/* ---------- effects ---------- */
function hurt(c, n) {
  const el = cellEl(c.l, c.r);
  if (!c || c.hp <= 0) return 0;
  if (c.ward) { c.ward = false; float(el, '🛡', 'buff'); return 0; }
  c.hp -= n;
  float(el, '-' + n, 'dmg');
  buzz(20);
  return n;
}

function buff(c, a, h) {
  c.atk += a; c.hp += h; c.max += h;
  float(cellEl(c.l, c.r), `+${a}/+${h}`, 'buff');
}

async function orbHit(side, n) {
  const P = G[side], el = orbEl(side);
  P.orb = Math.max(0, P.orb - n);
  float(el, '-' + n, 'dmg');
  el.classList.add('hit'); buzz(60);
  await rollOrb(side);
  el.classList.remove('hit');
}

async function heal(side, n) {
  const P = G[side], el = orbEl(side);
  const gain = Math.min(n, MAX_ORB - P.orb);
  if (gain <= 0) return;
  P.orb += gain;
  float(el, '+' + gain, 'heal');
  el.classList.add('heal');
  await rollOrb(side);
  el.classList.remove('heal');
}

// spin the d20 one pip at a time
async function rollOrb(side) {
  const P = G[side];
  while (P.shown !== P.orb) {
    P.shown += Math.sign(P.orb - P.shown);
    renderOrb(side);
    await sleep(P.shown <= P.orb ? 90 : 55);
  }
}

// remove dead creatures after their death animation
async function settle() {
  const dead = creatures('p').concat(creatures('e')).filter(c => c.hp <= 0);
  if (dead.length) { render(); await sleep(450); dead.forEach(c => { if (G.board[c.l][c.r] === c) G.board[c.l][c.r] = null; }); }
  render();
  checkOver();
}

function checkOver() {
  if (G.over) return true;
  if (G.p.orb > 0 && G.e.orb > 0) return false;
  G.over = true; G.busy = true;
  const won = G.e.orb <= 0;
  setTimeout(() => {
    $('#ov-title').textContent = won ? '🏆 Victory!' : '💀 Defeated';
    $('#ov-text').textContent = won ? `The enemy orb is shattered on turn ${G.round}.` : 'Your orb has spun down to zero.';
    $('#ov-btn').textContent = 'Play Again';
    $('#overlay').hidden = false;
  }, 700);
  return true;
}

/* ---------- playing cards ---------- */
async function playCreature(s, idx, lane) {
  const P = G[s], c = P.hand[idx];
  P.mana -= c.cost; P.hand.splice(idx, 1);
  const r = HOME[s];
  G.board[lane][r] = { side: s, l: lane, r, uid: c.uid, name: c.name, icon: c.icon, atk: c.atk, hp: c.hp, max: c.hp, kw: c.kw,
    ward: c.kw.includes('ward'), sick: !c.kw.includes('swift'), frozen: 0, mv: moveOf(c), fresh: true };
  G.sel = null; G.insp = null;
  if (s === 'e') G.msg = `Foe summoned ${c.name}.`;
  render();
  await sleep(300);
}

async function castSpell(s, idx, target) {
  const P = G[s], c = P.hand[idx];
  P.mana -= c.cost; P.hand.splice(idx, 1);
  G.sel = null; G.insp = null; G.busy = true;
  if (c.trap) {
    G.traps[target.j][target.r] = { owner: s, def: c };
    G.msg = s === 'p' ? `${c.name} set in the jungle.` : 'Foe set a trap in the jungle…';
    render();
    await sleep(400);
  } else {
    G.msg = `${s === 'p' ? 'You cast' : 'Foe cast'} ${c.name}!`;
    render();
    await c.fx(s, target);
    render();
    await sleep(450);
    await settle();
  }
  if (s === 'p' && !G.over) { G.busy = false; render(); }
}

/* ---------- AI ---------- */
function aiPick() {
  const P = G.e, best = { score: 0 };
  P.hand.forEach((c, idx) => {
    if (c.cost > P.mana) return;
    if (c.type === 'c') {
      for (let l = 0; l < 3; l++) {
        if (at(l, HOME.e)) continue;
        let sc = (c.atk + c.hp) * 0.5 + c.cost * 0.4 + (c.kw.length ? 1 : 0);
        const foes = creatures('p').filter(f => f.l === l);
        if (!foes.length) sc += 1 + c.atk * 0.4;
        else {
          const f = foes[0];
          if (c.atk >= f.hp) sc += 1.5;
          if (c.hp > f.atk) sc += 1.5;
        }
        sc += Math.random() * 0.5;
        if (sc > best.score) Object.assign(best, { score: sc, type: 'c', idx, lane: l });
      }
    } else if (c.t === 'jungle') {
      const free = [];
      for (let j = 0; j < 2; j++) for (let r = 1; r <= 3; r++) if (!G.traps[j][r]) free.push({ j, r, w: r === 3 ? 1 : 3 });
      if (!free.length || G.traps.flat().filter(t => t && t.owner === 'e').length >= 3) return;
      const bag = free.flatMap(f => Array(f.w).fill(f));
      const sc = c.ai() + Math.random() * 0.4;
      if (sc > best.score) Object.assign(best, { score: sc, type: 's', idx, target: bag[rnd(bag.length)] });
    } else {
      const cands = c.t === 'enemy' ? creatures('p') : c.t === 'ally' ? creatures('e') : [null];
      cands.forEach(t => {
        const sc = c.ai('e', t) + Math.random() * 0.3;
        if (sc > best.score) Object.assign(best, { score: sc, type: 's', idx, target: t });
      });
    }
  });
  return best.type ? best : null;
}

// score a stopping tile for an AI creature
function aiTileScore(c, r) {
  const reach = reachOf(c);
  let sc = Math.abs(r - c.r) * 0.3 * (r > c.r ? 1 : -2);
  // can it hit something right away?
  if (!c.sick) {
    for (let d = 1; d <= reach; d++) {
      const t = at(c.l, r + DIR.e * d);
      if (t && t.side === 'p') { sc += 2 + Math.min(c.atk, t.hp) + (c.atk >= t.hp ? 3 : 0); break; }
    }
    if (FRONT.e - r + 1 <= reach) sc += 2 + c.atk * 1.2;
  }
  // will it get mauled next turn?
  for (const t of creatures('p')) {
    if (t.l !== c.l || t.r >= r) continue;
    const gap = r - t.r;
    if (gap <= reachOf(t) + moveOf(t) && t.atk >= c.hp && c.atk < t.hp) sc -= 2 + c.cost * 0.4;
  }
  return sc + Math.random() * 0.4;
}

async function aiMoves() {
  for (const c of byFront('e')) {
    if (G.over || c.hp <= 0) continue;
    const opts = reachable(c).concat([c.r]);
    let best = c.r, bs = -Infinity;
    for (const r of opts) { const sc = aiTileScore(c, r) + (r === c.r ? 0.2 : 0); if (sc > bs) { bs = sc; best = r; } }
    if (best !== c.r) { await moveTo(c, best); await sleep(250); }
  }
}

async function aiTurn() {
  await sleep(900);
  await aiMoves();
  for (let i = 0; i < 12 && !G.over; i++) {
    const a = aiPick();
    if (!a) break;
    if (a.type === 'c') await playCreature('e', a.idx, a.lane);
    else await castSpell('e', a.idx, a.target);
    await sleep(500);
  }
  if (!G.over) await aiMoves();
  if (!G.over) { await sleep(300); await endTurn('e'); }
}

/* ---------- input ---------- */
function selCard() { return G.sel !== null ? G.p.hand[G.sel] : null; }
const myTurn = () => !G.busy && !G.over && G.turn === 'p';

function onHand(i) {
  if (!myTurn()) return;
  G.sel = G.sel === i ? null : i; G.insp = null; G.mv = null;
  const c = G.p.hand[i];
  if (G.sel !== null && c.cost > G.p.mana) G.msg = `Not enough mana (${c.cost} needed).`;
  render();
}

async function onCell(l, r) {
  if (!myTurn()) return;
  const sel = selCard(), c = at(l, r);
  if (sel) {
    if (sel.cost > G.p.mana) { G.msg = 'Not enough mana!'; return render(); }
    if (sel.type === 'c' && !c && r === HOME.p) return playCreature('p', G.sel, l);
    if (sel.t === 'enemy' && c && c.side === 'e') return castSpell('p', G.sel, c);
    if (sel.t === 'ally' && c && c.side === 'p') return castSpell('p', G.sel, c);
    G.msg = sel.type === 'c' ? 'Summon onto an empty tile on YOUR home row (bottom).' : 'Not a valid target.';
    return render();
  }
  if (G.mv && !c && G.mv.l === l && reachable(G.mv).includes(r)) {
    const m = G.mv; G.busy = true;
    await moveTo(m, r);
    if (!G.over) { G.busy = false; G.mv = m.hp > 0 && m.mv > 0 && !m.frozen ? m : null; render(); }
    return;
  }
  if (c && c.side === 'p') { G.mv = G.mv === c ? null : c; G.insp = null; }
  else { G.mv = null; G.insp = c ? { kind: 'c', c } : null; }
  render();
}

function onJungle(j, r) {
  if (!myTurn()) return;
  const sel = selCard(), trap = G.traps[j][r];
  if (sel && sel.t === 'jungle' && r >= 1 && r <= ROWS - 2 && !trap) {
    if (sel.cost > G.p.mana) { G.msg = 'Not enough mana!'; return render(); }
    return castSpell('p', G.sel, { j, r });
  }
  G.mv = null;
  G.insp = trap && trap.owner === 'p' ? { kind: 't', trap } : null;
  if (sel && sel.t === 'jungle') G.msg = 'Traps go on an empty jungle tile (the shaded middle ones).';
  render();
}

function onOrb(s) {
  if (!myTurn()) return;
  const sel = selCard();
  if (sel && sel.t === 'orb' && s === 'e' && sel.cost <= G.p.mana) castSpell('p', G.sel, null);
}

/* ---------- rendering ---------- */
function orbSVG(v, max) {
  const pct = v / max, col = pct > 0.6 ? '#52e0ff' : pct > 0.3 ? '#f5c451' : '#ff5a6e';
  return `<svg viewBox="0 0 120 120" style="--glow:${col}">
    <polygon points="60,4 110,32 110,88 60,116 10,88 10,32" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="60,24 94,82 26,82" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="2"/>
    <path d="M60 24V4M60 24L10 32M60 24L110 32M94 82L110 32M94 82L110 88M94 82L60 116M26 82L10 32M26 82L10 88M26 82L60 116" stroke="${col}" stroke-width="1.6" fill="none" opacity=".8"/>
    <text class="num" x="60" y="64" dominant-baseline="middle">${v}</text></svg>`;
}
function renderOrb(s) { orbEl(s).innerHTML = orbSVG(G[s].shown, MAX_ORB); }

function kwBadges(c) {
  let k = '';
  if (c.kw.includes('swift')) k += KW.swift[0];
  if (c.kw.includes('range')) k += KW.range[0];
  if (c.ward) k += KW.ward[0];
  if (c.kw.includes('life')) k += KW.life[0];
  return k;
}

function cardText(c) {
  if (c.type === 's') return `${c.name} (${c.cost}) — ${c.text}`;
  const ks = c.kw.map(k => KW[k][1]).join(' ');
  return `${c.name} (${c.cost}) ${c.atk}/${c.hp}${ks ? ' — ' + ks : ''}`;
}

function handCard(c, i, afford) {
  const d = document.createElement('div');
  d.className = `card ${c.type === 's' ? 'spell' : ''} ${c.trap ? 'trap' : ''} ${afford ? '' : 'nope'} ${G.sel === i ? 'sel' : ''}`;
  d.innerHTML = `<div class="cost">${c.cost}</div><div class="ic">${c.icon}</div><div class="nm">${c.name}</div>` +
    (c.type === 's' ? `<div class="tx">${c.trap ? '<b>TRAP</b> ' : ''}${c.text}</div>` :
      `<div class="kw">${kwBadges(c)}</div><div class="st"><span class="atk">${c.atk}</span><span class="hp">${c.hp}</span></div>`);
  d.onclick = () => onHand(i);
  return d;
}

function renderBoard(sel, canAct, afford) {
  const board = $('#board');
  board.innerHTML = '';
  const reach = G.mv && canAct ? reachable(G.mv) : [];
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < 5; col++) {
      const cell = document.createElement('div');
      if (col % 2 === 0) {
        const l = col / 2, c = G.board[l][r];
        const summonOK = canAct && afford && sel && sel.type === 'c' && r === HOME.p && !c;
        const tgtOK = canAct && afford && sel && c && ((sel.t === 'enemy' && c.side === 'e') || (sel.t === 'ally' && c.side === 'p'));
        const moveOK = !sel && G.mv && G.mv.l === l && reach.includes(r) && !c;
        cell.className = 'cell lane' + (r === 0 ? ' home-e' : r === ROWS - 1 ? ' home-p' : '') +
          (summonOK ? ' valid' : '') + (moveOK ? ' valid move' : '');
        cell.dataset.cell = `${l}-${r}`;
        if (c) {
          const d = document.createElement('div');
          const picked = G.mv === c || (G.insp && G.insp.c === c);
          d.className = `card tok ${c.side === 'p' ? 'mine' : 'foe'}${c.hp <= 0 ? ' dying' : ''}${c.fresh ? ' spawn' : ''}${tgtOK ? ' tgt' : ''}${picked ? ' picked' : ''}`;
          const status = (c.sick ? '💤' : '') + (c.frozen > 0 ? '🧊' : '') + (c.side === 'p' && !c.sick && c.frozen <= 0 && c.mv > 0 && canAct ? '' : '');
          d.innerHTML = `<div class="ic">${c.icon}</div><div class="kw">${kwBadges(c)}${status}</div>` +
            `<div class="st"><span class="atk">${c.atk}</span><span class="hp ${c.hp < c.max ? 'dmg' : ''}">${Math.max(0, c.hp)}</span></div>`;
          c.fresh = false;
          cell.appendChild(d);
        }
        cell.onclick = () => onCell(l, r);
      } else {
        const j = (col - 1) / 2, trap = G.traps[j][r], trapRow = r >= 1 && r <= ROWS - 2;
        const ok = canAct && afford && sel && sel.t === 'jungle' && trapRow && !trap;
        cell.className = 'cell jungle' + (trapRow ? ' trapslot' : '') + (ok ? ' valid' : '');
        cell.dataset.jungle = `${j}-${r}`;
        cell.textContent = trap ? (trap.owner === 'p' ? trap.def.icon : '❓') : trapRow ? '' : '🌲';
        if (trap) cell.classList.add(trap.owner === 'p' ? 'mytrap' : 'foetrap');
        cell.onclick = () => onJungle(j, r);
      }
      board.appendChild(cell);
    }
  }
}

function render() {
  if (!G) return;
  renderOrb('p'); renderOrb('e');
  const sel = selCard(), canAct = myTurn(), afford = sel && sel.cost <= G.p.mana;
  renderBoard(sel, canAct, afford);

  // hand + stats
  const hand = $('#hand');
  const keep = hand.scrollLeft;
  hand.innerHTML = '';
  G.p.hand.forEach((c, i) => hand.appendChild(handCard(c, i, c.cost <= G.p.mana)));
  hand.scrollLeft = keep;
  $('#e-hand').textContent = `🂠 ${G.e.hand.length}`;
  $('#e-deck').textContent = `📚 ${G.e.deck.length}`;
  $('#e-mana').textContent = `💎 ${G.e.mana}/${G.e.max}`;
  $('#p-mana').innerHTML = Array.from({ length: G.p.max }, (_, i) => `<i class="gem ${i < G.p.mana ? 'on' : ''}"></i>`).join('');
  $('#p-mana-t').textContent = `${G.p.mana}/${G.p.max} · 📚 ${G.p.deck.length}`;
  orbEl('e').classList.toggle('target', !!(canAct && afford && sel.t === 'orb'));

  const end = $('#end');
  end.disabled = !canAct;
  const canMove = creatures('p').some(c => reachable(c).length);
  end.classList.toggle('ready', canAct && !canMove && !G.p.hand.some(c => c.cost <= G.p.mana));

  // info bar
  let txt = G.msg;
  const unit = c => `${c.name} ${c.atk}/${Math.max(0, c.hp)}` + (c.kw.length ? ' — ' + c.kw.map(k => KW[k][1]).join(' ') : '') +
    (c.sick ? ' — 💤 can\'t attack yet' : '') + (c.frozen > 0 ? ' — 🧊 frozen' : '');
  if (sel) {
    txt = cardText(sel) + (afford ? '' : ' — not enough mana');
    if (afford) txt += sel.type === 'c' ? ' → tap a glowing tile on your home row'
      : sel.t === 'none' ? '' : sel.t === 'orb' ? ' → tap enemy orb' : sel.t === 'jungle' ? ' → tap a glowing jungle tile' : ' → tap a target';
  } else if (G.mv && G.mv.hp > 0) {
    txt = unit(G.mv) + (reachable(G.mv).length ? ` → tap a glowing tile to move (${G.mv.mv} left)` : ' — no moves left');
  } else if (G.insp && G.insp.kind === 'c' && G.insp.c.hp > 0) txt = unit(G.insp.c);
  else if (G.insp && G.insp.kind === 't') txt = `Your ${G.insp.trap.def.name}: ${G.insp.trap.def.text}`;
  $('#info-t').textContent = txt;
  $('#cast').hidden = !(canAct && afford && sel.t === 'none');
}

/* ---------- floating numbers ---------- */
function float(el, txt, cls) {
  if (!el) return;
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float ' + cls; f.textContent = txt;
  f.style.left = r.left + r.width / 2 + 'px'; f.style.top = r.top + r.height / 2 + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 950);
}

/* ---------- boot ---------- */
$('#end').onclick = () => { if (myTurn()) endTurn('p'); };
$('#cast').onclick = () => { if (myTurn() && selCard() && selCard().t === 'none') castSpell('p', G.sel, null); };
document.querySelectorAll('[data-orb]').forEach(el => (el.onclick = () => onOrb(el.dataset.orb)));
$('#ov-btn').onclick = newGame;

// intro screen
$('#ov-title').textContent = '🔮 Orb Brawl';
$('#ov-text').innerHTML = `Spin the enemy's <b>d20 orb</b> down to 0 before yours hits 0.<br><br>
• Three long lanes. Summon onto your <b>home row</b> (bottom), then tap a creature and a glowing tile to <b>march</b> it up the lane (2 tiles a turn).<br>
• At end of turn your creatures hit the enemy right in front of them (🏹 range 2). Reach the far end and you hit the orb.<br>
• Set <b>hidden traps</b> 🪤 in the jungle between lanes — they spring on enemies stepping beside them.<br>
• 💤 new units can't attack until next turn (⚡ can). 🛡 Ward blocks a hit. 💚 Lifelink heals your orb.`;
$('#ov-btn').textContent = 'Start Brawl';
