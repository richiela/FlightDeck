# Visual baselines

Dated folders under here hold Viewer reference screenshots.

**Checkpoint requirement:** compare fresh **playing layouts** only (`{game}__playing.png`) to the latest dated folder. See `.cursor/rules/checkpoint-qa.mdc` class V.

```bash
# against running mock on :4000
node qa/capture-playing-layouts.js --port 4000
# writes qa/visual-baselines/_pending/ + prints unchanged/changed vs latest dated baseline
```

On intentional visual changes: confirm with user, then promote `_pending` `__playing` files into a new `YYYY-MM-DD` folder (do not silently overwrite).

Overlay/transition PNGs (if present in older dumps) are **not** the default regression set.
