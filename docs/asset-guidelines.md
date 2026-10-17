# Asset Guidelines

## Golden Rule

Everything in this project is original or compatibly licensed. Never import,
trace, copy, or closely imitate any GTA or other third-party copyrighted
content (maps, models, textures, audio, text, logos).

## Sourcing

- Prefer assets you create for this project.
- Third-party assets are allowed only with a compatible license (e.g. CC0,
  CC-BY with attribution recorded, or engine-marketplace content used per its
  license). Record each asset's source and license in an `ATTRIBUTION.md`
  file next to the asset or at the content root.
- When in doubt, leave it out and create a placeholder you own.

## Organization (district-based)

Mirror the milestone structure so content scales district by district:

- `Content/Districts/District00/` — vertical-slice content (M1).
- `Content/Districts/District01/`, … — later districts (M2+).
- `Content/Shared/` — reused props, materials, characters, vehicles.
- `Content/Audio/` — music, ambient beds, SFX (original or licensed).

## Naming Conventions

- Prefix by type: `SM_` static mesh, `M_` material, `T_` texture,
  `BP_` blueprint/prefab, `A_` audio, `LVL_` level/scene.
- Include district: `SM_D00_StreetLamp_01`, `BP_D00_TrafficCar_Sedan`.
- Shared assets use `SH`: `M_SH_Asphalt_01`.
- Never use names referencing GTA places, characters, or brands.
