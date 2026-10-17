# Unreal Path (recommended primary)

Unreal Engine 5, starting from the City Sample. This path gives a GTA-like
foundation out of the box: a streamed city, traffic/crowd systems, vehicles,
and modern lighting.

## Why This Is the Primary Path

- World Partition: automatic grid-cell streaming from a single persistent
  level — no manual sublevel division for large worlds.
- Lumen: fully dynamic global illumination and reflections (default in new
  projects); integrates with Nanite, World Partition, and Virtual Shadow Maps.
- Nanite: virtualized geometry with automatic LOD and streaming for
  high-detail city meshes.
- City Sample: combines World Partition + One File Per Actor streaming,
  Nanite, Lumen, Virtual Shadow Maps, Mass AI traffic/crowds on the
  MetaHuman library, and Chaos vehicle/destruction physics.

Sources:

- https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine
- https://dev.epicgames.com/documentation/unreal-engine/city-sample-project-unreal-engine-demonstration

## Setup Steps (in-engine, by you)

1. Install a City Sample-compatible UE5 version via the Epic Games Launcher.
2. Open Fab, find the City Sample, and click Add to My Library so it appears
   in the launcher under Unreal Engine > Library > Fab Library. (Sample
   projects only appear there when a compatible engine version is installed.)
3. Click Create Project and follow the on-screen instructions.
4. Install on an SSD — Nanite and Virtual Shadow Maps depend on fast storage.
5. Open the city map and press Play.

## Hardware Expectations (per the City Sample docs)

- Windows 10 with DirectX 12, 12-core CPU at 3.4 GHz, 64 GB RAM,
  RTX-2080 / Radeon 6000 class GPU or better, 8 GB+ VRAM.
- On lower-spec machines, lower the viewport Screen Percentage (Viewport
  Options, upper-left of the editor viewport) before judging performance.

## Highest-Risk Check (do before M1)

City Sample project opens and plays in the city map at an acceptable frame
rate on your hardware. If it does not run, stop: either upgrade hardware,
reduce quality settings, or switch to the Unity path — do not start
District 0 until the base sample plays.

## Local Environment (this machine, verified)

- Project: `/Users/reneturcios/Documents/Unreal Projects/CitySample`
  (`CitySample.uproject`, EngineAssociation 5.8).
- Engine: `/Users/Shared/Epic Games/UE_5.8` (+ Epic Games Launcher).
- Maps: `Content/Map/Small_City_LVL.umap` (start here — lighter),
  `Content/Map/Big_City_LVL.umap`.
- Status: editor binaries already compiled (`Binaries/Mac`), full sample
  content present (City, Crowd, Vehicle, WFC, ExternalActors) — this
  project has been built/opened before.
