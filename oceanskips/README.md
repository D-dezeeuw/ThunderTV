# OceanSkips 🐟🎉

A standalone mini-game, unrelated to the ThunderTV app code: a festive
beach-fiesta take on stone skipping where a luchador bats a fish across the
ocean. Lives entirely in `index.html` — no build, no dependencies, no network.
Open the file in a browser or serve the directory on GitHub Pages
(`/oceanskips/`). Works offline; designed for landscape mobile.

## How it plays

1. Pick one of 5 fish (different power / bounce / drag / lift / sea-legs).
2. Tap once — the luchador tosses the fish up.
3. Tap again to swing the bat. Contact height sets the launch angle
   (early = steep, late = flat); closeness to the sweet-spot ring sets power.
4. In flight, hold anywhere to boost 🌶️ while the energy meter lasts.
   Golden fish-food spheres refill energy and bank as shop currency.
5. Wave slope tilts every bounce; drop below the fish's minimum skim speed
   and it sinks. The sea gets darker and rougher the farther you fly.
6. Spend food in the Mercado on permanent upgrades (localStorage save).

## Code layout (single file, sectioned)

`index.html` is organised top-to-bottom: CSS/UI → fish + upgrade data →
save/audio → wave model (`surfaceAt`) → zone palettes → physics
(`stepPhysics`: toss, swing, boost, bounce/sink) → rendering → input →
main loop. All tuning constants sit in one block near the top of the script.
