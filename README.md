# Orb Brawl

A mini lane card battler for mobile. Open `index.html` in a browser (or serve the folder statically) — no build step, no dependencies.

## How to play
- Each player has a **d20 orb** that starts at 20. Spin the enemy orb down to 0 to win.
- 3 lanes. Tap a card in your hand, then tap an empty lane on your side to summon.
- At the end of your turn your creatures attack straight across their lane: a blocker trades blows with them, an empty lane means the orb takes the hit.
- New creatures are 💤 and can't attack until your next turn (⚡ Swift can).
- Keywords: ⚡ Swift, 🛡 Ward (ignores first damage), 💚 Lifelink (heals your orb).
- Mana grows by 1 each turn up to 10. Spells target a creature, the enemy orb, or nothing (tap Cast).

## Files
- `game.js` — rules, card pool, AI and rendering
- `style.css`, `index.html` — mobile-first UI
