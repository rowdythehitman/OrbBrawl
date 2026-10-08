# Orb Brawl

A mini lane card battler for mobile. Open `index.html` in a browser (or serve the folder statically) — no build step, no dependencies.

## How to play
- Each player has a **d20 orb** that starts at 20. Spin the enemy orb down to 0 to win.
- **3 long lanes** (5 tiles each) with **jungle** strips between them. Your home row is the bottom, the enemy's is the top.
- Tap a creature card, then a glowing home-row tile to summon. Tap one of your creatures, then a glowing tile to **march** it (2 tiles/turn, Swift 3; forward or back, blocked by units).
- At end of turn each creature hits the enemy directly in front of it (🏹 Ranged hits 2 tiles). The target hits back if it can reach. Stand on the far row (or 2 tiles away with Ranged) and nothing in the way and the orb takes the damage.
- **Traps** (🪤 🕳️ 🔮) are set face-down on the shaded jungle tiles. They spring when an enemy steps onto a lane tile beside them, then stop that creature. Enemy traps show as ❓.
- New creatures are 💤 and can't attack until your next turn (⚡ Swift can). 🧊 Frozen units can't move or attack.
- Keywords: ⚡ Swift, 🛡 Ward, 💚 Lifelink, 🏹 Ranged.
- Mana grows by 1 each turn up to 10. Spells target a creature, the enemy orb, or nothing (tap Cast).

## Files
- `game.js` — rules, card pool, AI and rendering
- `style.css`, `index.html` — mobile-first UI
