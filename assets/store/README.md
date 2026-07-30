# assets/store/

Store-listing artwork for the LG webOS Content Store submission — not
consumed by the app build (unlike `assets/branding/`, which
`scripts/generate-icons.mjs` reads from). These are one-off marketing
assets uploaded directly to LG's developer portal.

- `thundertv-wallpaper-master-5504x3072.png` — the AI-generated 16:9
  master wallpaper (Google Gemini 3 Pro Image / "Nano Banana Pro" via
  OpenRouter, `google/gemini-3-pro-image-preview`), composed with
  `assets/branding/thundertv-icon-master.png` as a reference image so the
  logo reproduces faithfully. Regenerate from this master any time the
  crop list changes — don't re-prompt the image model for a single new
  size.
- `wallpapers/thundertv-wallpaper-<W>x<H>.png` — center-cropped ("cover"
  resize, like CSS `background-size: cover`, no upscaling) from the
  master for each resolution LG's store submission form asks for:
  1280×720, 1920×1080, 955×537, 960×540, 1024×600, 1024×768, 1366×768,
  1920×720 (24:9), 1920×804 (projector), 2560×1080 (21:9), 2560×1440,
  3840×1440, 3840×2160.

The composition keeps the logo centered with a large empty margin (~35%
of frame height above/below) specifically so a single wide master crops
cleanly to every aspect ratio from ultrawide 24:9 down to 4:3 without the
logo ever nearing an edge.

App icons (the `icon`/`largeIcon` LG's `appinfo.json` schema wants) are
already produced by the existing `assets/branding/` +
`scripts/generate-icons.mjs` pipeline — see `webos/icon.png` /
`webos/largeIcon.png`, regenerated with `node scripts/generate-icons.mjs`.
No new icon art was needed for this pass.

## Regenerating

```
python3 <scratch>/gen.py --prompt-file <scratch>/prompt_wallpaper.txt \
  --ref assets/branding/thundertv-icon-master.png \
  --out out --aspect 16:9 --res 4K
python3 <scratch>/crop.py   # cover-crops the chosen master into wallpapers/
```

Uses the `OPENROUTER_API_KEY` env var against
`https://openrouter.ai/api/v1/chat/completions`,
model `google/gemini-3-pro-image-preview`, with `image_config: {aspect_ratio, image_size}`
and the reference image passed as a base64 `image_url` content part.
