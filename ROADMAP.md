# Roadmap: Open City Remake

Gate rule: no milestone starts until the previous milestone's exit criteria pass.

## M1 — Vertical Slice: District 0 (do this first)

One small drivable/walkable district proving every core system:

- Street grid with sidewalks, lighting, and collision.
- 1 on-foot player character with camera and movement.
- 1 drivable vehicle (enter/exit, arcade handling).
- Day/night lighting cycle.
- 1 complete mission (objective → completion → reward).
- Basic wanted response (law-enforcement attention escalates and decays).

Exit criteria: playable end-to-end — spawn → walk → enter vehicle → drive →
complete 1 mission → wanted response triggers. Runs at an acceptable frame
rate on target hardware.

## M2 — City Streaming + Traffic/Crowds

- Expand beyond District 0 using the engine's world-streaming system
  (Unreal: World Partition grid cells; Unity: additive scene streaming).
- Ambient traffic (vehicles following roads) and pedestrian crowds.
- LOD strategy for buildings, props, and characters.

Exit criteria: player can travel across multiple districts with no visible
streaming hitches; traffic and crowds active without breaking frame budget.

## M3 — Mission/Story Framework

- Original story outline (new characters, new city, new plot).
- Mission system: objectives, checkpoints, fail/retry states.
- Side activities (at least 2: e.g. races, collectibles).

Exit criteria: main-story mission chain playable start to finish; side
activities functional.

## M4 — Audio and Polish

- Urban soundscape, vehicle and UI audio (all original or licensed).
- UI/HUD pass: minimap, objectives, wanted indicator, menus.
- Bug-fix and game-feel pass on movement, driving, and camera.

Exit criteria: full play-through with final UI and audio, no placeholder assets.

## M5 — Performance Pass and Packaged Build

- Profile on minimum-spec hardware; optimize lighting, shadows, and streaming.
- Package a distributable test build.
- Smoke test: fresh install → new game → M1 play-through on the packaged build.

Exit criteria: packaged build passes the smoke test at target frame rate.

## Assumptions

- Single-player only (multiplayer would be a separate roadmap).
- Primary engine Unreal Engine 5; Unity + HDRP documented as the alternative.
- `web-prototype/` is a pre-M1 browser slice for fast iteration; M1 exit
  criteria still apply to the engine build, not the prototype.
