# Unity Path (alternative)

Unity with the High Definition Render Pipeline (HDRP). Choose this path if
your team already knows Unity or your hardware cannot run the Unreal City
Sample. Note: there is no single first-party city/traffic/crowd sample
equivalent to Unreal's City Sample, so traffic, crowds, and city streaming
must be built or sourced separately.

## Core Concepts (per the HDRP 17.0 manual)

- Project setup: create and assign an HDRP Asset, which controls the global
  rendering settings and creates an instance of HDRP.
- Build/project configuration: HDRP Wizard, HDRP Config package, frame
  settings, and Quality Settings.
- Scene setup: the Volume framework controls lighting and effects in a scene.

Sources:

- https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/getting-started-in-hdrp.html
- https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/project-setup.html

## Setup Steps (in-engine, by you)

1. Create a new project using the HDRP template (installs HDRP + dependencies).
2. Create an HDRP Asset and assign it as the active render pipeline asset.
3. Run the HDRP Wizard / configuration and set frame settings and Quality
   Settings for your target platform.
4. Set up Volumes in your scene for lighting and effects control.
5. Open the sample scene and press Play.

## Highest-Risk Check (do before M1)

The HDRP sample scene opens, renders lighting/volumes correctly, and plays
at an acceptable frame rate on your hardware. If it does not run, stop and
resolve rendering/hardware issues before starting District 0.
