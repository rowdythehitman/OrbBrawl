'use strict';
/* ORB BRAWL — a mini lane card battler. No dependencies. */

const MAX_ORB = 20, HAND_MAX = 7, DECK_SIZE = 30, MAX_MANA = 10;
const LANES = ['Left', 'Mid', 'Right'];
const KW = {
  swift: ['⚡', 'Swift: can attack the turn it is played.'],
  ward:  ['🛡', 'Ward: ignores the first damage it takes.'],
  life:  ['💚', 'Lifelink: heals your orb when it deals damage.'],
};

// [id, name, icon, cost, atk, hp, keywords]
const CREATURES = [
  ['sprite',  'Ember Sprite',     '🔥', 1, 2, 1, ['swift']],
  ['imp',     'Sewer Imp',        '👺', 1, 1, 3, []],
  ['wolf',    'Barrow Wolf',      '🐺', 2, 3, 2, []],
  ['rune',    'Rune Apprentice',  '🧙', 2, 2, 3, []],
  ['cleric',  'Hearth Cleric',    '🕯️', 2, 1, 3, ['life']],
  ['orc',     'Orc Brawler',      '👹', 3, 4, 3, []],
  ['ranger',  'Moon Elf Ranger',  '🧝', 3, 3, 3, ['swift']],
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
const aiKill = (s, l, n) => {
  const c = G[o(s)].lanes[l];
  if (!c || c.hp <= 0) return -1;
  if (c.ward) return 0.8;
  return c.hp <= n ? 3 + c.atk + c.hp * 0.5 : n * 0.4;
};

// t: target kind — 'enemy' creature, 'ally' creature, 'orb' (enemy), 'none'
const SPELLS = [
  { id: 'bolt', name: 'Arcane Bolt', icon: '✨', cost: 1, t: 'enemy', text: 'Deal 2 damage to an enemy creature.',
    fx: (s, l) => hurt(o(s), l, 2), ai: (s, l) => aiKill(s, l, 2) },
  { id: 'fire', name: 'Fireball', icon: '☄️', cost: 3, t: 'enemy', text: 'Deal 5 damage to an enemy creature.',
    fx: (s, l) => hurt(o(s), l, 5), ai: (s, l) => aiKill(s, l, 5) - 1 },
  { id: 'void', name: 'Void Bolt', icon: '🌀', cost: 3, t: 'orb', text: 'Deal 3 damage to the enemy orb.',
    fx: s => orbHit(o(s), 3), ai: s => (G[o(s)].orb <= 3 ? 50 : 2.2) },
  { id: 'mend', name: 'Mend', icon: '💖', cost: 2, t: 'none', text: 'Restore 4 to your orb.',
    fx: s => heal(s, 4), ai: s => (MAX_ORB - G[s].orb >= 4 ? (MAX_ORB - G[s].orb) / 2 : -1) },
  { id: 'cry', name: 'Battle Cry', icon: '📯', cost: 2, t: 'ally', text: 'An allied creature gets +2/+1.',
    fx: (s, l) => buff(s, l, 2, 1), ai: (s, l) => (G[s].lanes[l] ? 1.5 + G[s].lanes[l].atk * 0.5 : -1) },
  { id: 'wardrune', name: 'Ward Rune', icon: '🔰', cost: 1, t: 'ally', text: 'An allied creature gains Ward.',
    fx: (s, l) => { const c = G[s].lanes[l]; c.ward = true; float(slotEl(s, l), '🛡', 'buff'); },
    ai: (s, l) => { const c = G[s].lanes[l]; return c && !c.ward ? 1 + c.atk * 0.4 : -1; } },
  { id: 'storm', name: 'Lightning Storm', icon: '⛈️', cost: 4, t: 'none', text: 'Deal 2 damage to ALL enemy creatures.',
    fx: s => [0, 1, 2].forEach(l => G[o(s)].lanes[l] && hurt(o(s), l, 2)),
    ai: s => { const cs = G[o(s)].lanes.filter(Boolean); return cs.length >= 2 ? cs.length * 2.2 + cs.filter(c => c.hp <= 2).length * 2 : -1; } },
].map(sp => ({ ...sp, type: 's', kw: [] }));

const POOL = [...CREATURES, ...SPELLS];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
const slotEl = (s, l) => document.querySelector(`[data-slot="${s}${l}"]`);
const orbEl = s => $('#orb-' + s);

let G;

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
  return { orb: MAX_ORB, shown: MAX_ORB, mana: 0, max: 0, deck: buildDeck(), hand: [], lanes: [null, null, null] };
}

/* ---------- game flow ---------- */
async function newGame() {
  G = { p: mkSide(), e: mkSide(), turn: 'p', round: 0, busy: true, over: false, sel: null, insp: null, msg: '' };
  for (const s of ['p', 'e']) {
    const P = G[s];
    for (let i = 0; i < (s === 'e' ? 5 : 4); i++) P.hand.push(P.deck.pop());
    if (!P.hand.some(c => c.cost <= 2)) { // guarantee a playable opener
      const k = P.deck.findIndex(c => c.cost <= 2);
      if (k >= 0) P.hand[0] = P.deck.splice(k, 1)[0];
    }
  }
  $('#overlay').hidden = true;
  await startTurn('p');
}

async function startTurn(s) {
  const P = G[s];
  G.turn = s; G.insp = null; G.sel = null;
  if (s === 'p') G.round++;
  P.max = Math.min(MAX_MANA, P.max + 1);
  P.mana = P.max;
  P.lanes.forEach(c => c && (c.sick = false));
  await draw(s);
  if (G.over) return;
  if (s === 'p') { G.busy = false; G.msg = `Turn ${G.round} — your move!`; render(); }
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
  G.busy = true; G.sel = null; G.insp = null;
  G.msg = s === 'p' ? 'Your creatures attack!' : 'The enemy attacks!';
  render();
  for (let l = 0; l < 3; l++) { if (await attack(s, l)) return; }
  await startTurn(o(s));
}

async function attack(s, l) {
  const P = G[s], Q = G[o(s)], c = P.lanes[l];
  if (!c || c.sick || c.hp <= 0) return false;
  const el = slotEl(s, l).firstElementChild;
  el && el.classList.add(s === 'p' ? 'lunge-up' : 'lunge-down');
  await sleep(160);
  const t = Q.lanes[l];
  if (t) {
    const back = t.atk;
    const dealt = hurt(o(s), l, c.atk);
    hurt(s, l, back);
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

/* ---------- effects ---------- */
function hurt(side, lane, n) {
  const c = G[side].lanes[lane], el = slotEl(side, lane);
  if (!c || c.hp <= 0) return 0;
  if (c.ward) { c.ward = false; float(el, '🛡', 'buff'); return 0; }
  c.hp -= n;
  float(el, '-' + n, 'dmg');
  buzz(20);
  return n;
}

function buff(side, lane, a, h) {
  const c = G[side].lanes[lane];
  c.atk += a; c.hp += h; c.max += h;
  float(slotEl(side, lane), `+${a}/+${h}`, 'buff');
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
  const dead = [];
  for (const s of ['p', 'e']) G[s].lanes.forEach((c, l) => c && c.hp <= 0 && dead.push([s, l]));
  if (dead.length) { render(); await sleep(450); dead.forEach(([s, l]) => (G[s].lanes[l] = null)); }
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
  P.lanes[lane] = { uid: c.uid, name: c.name, icon: c.icon, atk: c.atk, hp: c.hp, max: c.hp, kw: c.kw,
    ward: c.kw.includes('ward'), sick: !c.kw.includes('swift'), fresh: true };
  G.sel = null; G.insp = null;
  if (s === 'e') G.msg = `Foe summoned ${c.name} (${LANES[lane]})`;
  render();
  await sleep(300);
}

async function castSpell(s, idx, target) {
  const P = G[s], c = P.hand[idx];
  P.mana -= c.cost; P.hand.splice(idx, 1);
  G.sel = null; G.insp = null; G.busy = true;
  G.msg = `${s === 'p' ? 'You cast' : 'Foe cast'} ${c.name}!`;
  render();
  await c.fx(s, target);
  render();
  await sleep(450);
  await settle();
  if (s === 'p' && !G.over) { G.busy = false; render(); }
}

/* ---------- AI ---------- */
function aiPick() {
  const P = G.e, best = { score: 0 };
  P.hand.forEach((c, idx) => {
    if (c.cost > P.mana) return;
    if (c.type === 'c') {
      for (let l = 0; l < 3; l++) {
        if (P.lanes[l]) continue;
        const foe = G.p.lanes[l];
        let sc = (c.atk + c.hp) * 0.5 + c.cost * 0.4 + (c.kw.length ? 1 : 0);
        if (!foe) sc += 2 + c.atk * 0.8;
        else {
          if (c.atk >= foe.hp) sc += 2.5;
          if (c.hp > foe.atk) sc += 2;
          if (foe.atk >= c.hp && c.atk < foe.hp) sc -= 2;
        }
        sc += Math.random() * 0.5;
        if (sc > best.score) Object.assign(best, { score: sc, type: 'c', idx, lane: l });
      }
    } else {
      const cands = c.t === 'enemy' ? [0, 1, 2].filter(l => G.p.lanes[l])
        : c.t === 'ally' ? [0, 1, 2].filter(l => P.lanes[l]) : [null];
      cands.forEach(l => {
        const sc = c.ai('e', l) + Math.random() * 0.3;
        if (sc > best.score) Object.assign(best, { score: sc, type: 's', idx, target: l });
      });
    }
  });
  return best.type ? best : null;
}

async function aiTurn() {
  await sleep(900);
  for (let i = 0; i < 12 && !G.over; i++) {
    const a = aiPick();
    if (!a) break;
    if (a.type === 'c') await playCreature('e', a.idx, a.lane);
    else await castSpell('e', a.idx, a.target);
    await sleep(600);
  }
  if (!G.over) await endTurn('e');
}

/* ---------- input ---------- */
function selCard() { return G.sel !== null ? G.p.hand[G.sel] : null; }
const myTurn = () => !G.busy && !G.over && G.turn === 'p';

function onHand(i) {
  if (!myTurn()) return;
  G.sel = G.sel === i ? null : i; G.insp = null;
  const c = G.p.hand[i];
  if (G.sel !== null && c.cost > G.p.mana) G.msg = `Not enough mana (${c.cost} needed).`;
  render();
}

function onSlot(s, l) {
  if (!myTurn()) return;
  const sel = selCard(), c = G[s].lanes[l];
  if (sel) {
    if (sel.cost > G.p.mana) { G.msg = 'Not enough mana!'; return render(); }
    if (sel.type === 'c' && s === 'p' && !c) return playCreature('p', G.sel, l);
    if (sel.t === 'enemy' && s === 'e' && c) return castSpell('p', G.sel, l);
    if (sel.t === 'ally' && s === 'p' && c) return castSpell('p', G.sel, l);
  }
  G.insp = c ? { s, l } : null;
  if (!c && sel) G.msg = sel.type === 'c' ? 'Pick one of YOUR empty lanes.' : 'Not a valid target.';
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
  d.className = `card ${c.type === 's' ? 'spell' : ''} ${afford ? '' : 'nope'} ${G.sel === i ? 'sel' : ''}`;
  d.innerHTML = `<div class="cost">${c.cost}</div><div class="ic">${c.icon}</div><div class="nm">${c.name}</div>` +
    (c.type === 's' ? `<div class="tx">${c.text}</div>` :
      `<div class="kw">${kwBadges(c)}</div><div class="st"><span class="atk">${c.atk}</span><span class="hp">${c.hp}</span></div>`);
  d.onclick = () => onHand(i);
  return d;
}

function render() {
  if (!G) return;
  renderOrb('p'); renderOrb('e');
  const sel = selCard(), canAct = myTurn(), afford = sel && sel.cost <= G.p.mana;
  const slotOK = (s, c) => canAct && afford && (
    (sel.type === 'c' && s === 'p' && !c) || (sel.t === 'enemy' && s === 'e' && c) || (sel.t === 'ally' && s === 'p' && c));

  for (const s of ['e', 'p']) {
    const row = $('#row-' + s);
    row.innerHTML = '';
    for (let l = 0; l < 3; l++) {
      const c = G[s].lanes[l], slot = document.createElement('div');
      const ok = slotOK(s, c);
      slot.className = 'slot' + (ok && !c ? ' valid' : '');
      slot.dataset.slot = s + l; slot.dataset.lane = LANES[l];
      if (c) {
        const d = document.createElement('div');
        d.className = `card ${s === 'p' ? 'mine' : 'foe'}${c.sick ? ' sick' : ''}${c.hp <= 0 ? ' dying' : ''}${c.fresh ? ' spawn' : ''}${ok ? ' tgt' : ''}`;
        const insp = G.insp && G.insp.s === s && G.insp.l === l;
        d.style.outline = insp ? '2px solid var(--gold)' : '';
        d.innerHTML = `<div class="ic">${c.icon}</div><div class="nm">${c.name}</div><div class="kw">${kwBadges(c)}</div>` +
          `<div class="st"><span class="atk">${c.atk}</span><span class="hp ${c.hp < c.max ? 'dmg' : ''}">${Math.max(0, c.hp)}</span></div>`;
        c.fresh = false;
        slot.appendChild(d);
      }
      slot.onclick = () => onSlot(s, l);
      row.appendChild(slot);
    }
  }

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
  end.classList.toggle('ready', canAct && !G.p.hand.some(c => c.cost <= G.p.mana));

  // info bar
  let txt = G.msg;
  if (sel) {
    txt = cardText(sel) + (afford ? '' : ' — not enough mana');
    if (afford) txt += sel.type === 'c' ? ' → tap an empty lane' : sel.t === 'none' ? '' : sel.t === 'orb' ? ' → tap enemy orb' : ' → tap a target';
  } else if (G.insp && G[G.insp.s].lanes[G.insp.l]) {
    const c = G[G.insp.s].lanes[G.insp.l];
    txt = `${c.name} ${c.atk}/${Math.max(0, c.hp)}` + (c.kw.length ? ' — ' + c.kw.map(k => KW[k][1]).join(' ') : '') + (c.sick ? ' — summoning sick 💤' : '');
  }
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
• Tap a card, then tap a lane to summon.<br>
• At end of turn your creatures attack straight across their lane. Blocked? They trade blows. Empty lane? The orb takes the hit.<br>
• New creatures are 💤 and can't attack until your next turn (⚡ Swift can).<br>
• 🛡 Ward blocks one hit. 💚 Lifelink heals your orb.`;
$('#ov-btn').textContent = 'Start Brawl';
