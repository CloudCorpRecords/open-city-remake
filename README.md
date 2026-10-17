# Open City Remake

An original, GTA-style open-city 3D game with modern graphics — inspired by
GTA 5's structure (open city, on-foot + driving, missions, wanted system),
built with **fully original** content. No Rockstar IP of any kind.

## IP Rules (non-negotiable)

- No GTA 5 map, story, character, dialogue, audio, logo, or asset reuse.
- All content must be original or compatibly licensed; record the license
  of every third-party asset in `docs/asset-guidelines.md`.
- Working title only — pick a final original title before any public release.

## Structure

- `README.md` — vision, IP rules, how to start (this file).
- `ROADMAP.md` — milestones M1–M5 with exit criteria.
- `docs/unreal-path.md` — recommended primary engine setup (Unreal Engine 5 + City Sample).
- `docs/unity-path.md` — alternative engine setup (Unity + HDRP).
- `docs/asset-guidelines.md` — asset rules and naming conventions.
- `web-prototype/` — playable browser slice (District 0 on foot, see its
  README). Fully original, offline single file.

## How to Start

1. Read `ROADMAP.md`, especially the District 0 vertical slice (M1).
2. Run the highest-risk check first: open the base sample project for your
   chosen engine path and confirm it plays on your hardware (see engine guide).
3. If the sample runs, begin M1. If not, stop and downscope before building
   anything custom.

## Web Prototype (quick playable slice)

For the fastest playable check, open
`web-prototype/index.html` directly in a desktop browser (double-click;
no server or network needed). It covers most of M1 on foot and by car
(District 0 streets, buildings, day/night, pedestrians, drivable
sedan, courier mission, wanted stars + patrol) in original low-poly
style — it does not replace the engine milestones below.

## Version Control (recommended)

This folder is standalone — the workspace root is a home directory, not a repo.
Initialize version control inside this folder only:

```sh
cd /Users/reneturcios/open-city-remake
git init
```

Commit docs first, then add engine project files as they are created.
