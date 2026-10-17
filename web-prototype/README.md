# District 0 Web Prototype

Playable on-foot slice of the open-city concept: one walkable district with
original procedural buildings, pedestrians, a day/night cycle, and a
wanted-lite attention meter. Fully offline single file.

## Play

Open `index.html` directly in a desktop browser (double-click works, no
server or network needed), or serve the folder:

```sh
cd /Users/reneturcios/open-city-remake/web-prototype
python3 -m http.server 8123
# open http://localhost:8123/index.html
```

Controls: WASD/arrows move (drive when in the car), Shift sprint,
Space jump, E enter/exit the orange sedan, drag orbits the camera,
wheel zooms, N skips to night. Follow the gold beacon for the courier
mission; wanted stars bring a patrol cruiser — get busted and you
restart at spawn.

Touch controls (phones and tablets): tap the ground to walk there, tap
the sedan to enter it, tap ahead to drive, double-tap to jump (or exit
the car when slow), drag to orbit, pinch to zoom.

## Install as an app (PWA)

Serve the folder and open it in a mobile browser:

```sh
cd /Users/reneturcios/open-city-remake/web-prototype
python3 -m http.server 8123
# same machine: open http://localhost:8123/index.html
```

Then use the browser's "Add to Home Screen" / "Install app" action.
Installing requires a secure context (HTTPS hosting, or localhost on
the testing machine itself); over plain-HTTP LAN the game still plays
but cannot install. The service worker (`sw.js`) caches the game for
offline starts; the manifest and icons live in `manifest.webmanifest`
and `icons/`.

## Build

`index.html` is generated — do not edit it by hand:

```sh
cd /Users/reneturcios/open-city-remake/web-prototype
bash build.sh
```

`build.sh` concatenates `src/head.html` + `vendor/three.module.js` +
`src/game.js` + `src/tail.html`. Re-run it after any `src/` change, then
re-run the smoke test.

## Smoke test

No browser is required. The temporary Node harness (kept outside the repo
in `/tmp`) loads the exact `index.html` bytes with stubbed DOM/canvas and
drives scripted input for several frames. Ask the maintainer for the
harness path, or re-run:

```sh
node /tmp/oc-smoke/harness.mjs /Users/reneturcios/open-city-remake/web-prototype/index.html
```

## IP rules

Same as the project root: everything here is original. The only
third-party code is the MIT-licensed three.js build recorded in
`ATTRIBUTION.md`.
