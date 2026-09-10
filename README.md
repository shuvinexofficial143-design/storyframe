# StoryFrame AI — Manga & Webtoon Continuity Studio

StoryFrame is a project-based cinematic manga/webtoon continuity workspace.

## Main workflow

**Project → Chapter → Story Analysis → Persistent Visual Bible → Character / World / Location / Prop Bibles → Prompt Compiler → Google Cloud Vertex AI Gemini Image Generation → Previous Scene Memory → Pollinations flux-anime Fallback → Export**

## Core continuity features

- Multiple projects and chapters with IndexedDB persistence
- Persistent Project Visual Bible and master seed
- Character IDs, identity locks, costume locks and temporary story states
- World, location, prop, artifact and vehicle continuity records
- Master Style Lock and Global Negative / Avoidance Lock
- Cinematic beat-based scene splitting instead of sentence-by-sentence splitting
- Deterministic StoryFrame scene seed metadata with Regenerate Same / Variation / Lock Seed behavior
- Strict / Balanced / Loose continuity strength
- Compact previous-scene continuity memory instead of endlessly growing prompts
- Pre-generation continuity validation
- Canonical prompt compiler that reuses stable blocks instead of letting the scene LLM redesign established entities
- Canonical character-reference image generation and manual reference uploads

## Image provider architecture

StoryFrame uses a modular image-provider layer under `lib/image-providers/`.

### Primary: Google Cloud Vertex AI Gemini

Default model:

```text
gemini-3.1-flash-image
```

The provider calls the Google Cloud Vertex AI `aiplatform.googleapis.com` GenerateContent endpoint rather than the Google AI Studio Gemini endpoint. This keeps image generation on Google Cloud billing so eligible Google Cloud credits can apply.

The integration supports 1K image output, requested aspect ratio such as 16:9, and up to four stored reference images. Reference priority is:

1. recurring character reference images
2. recurring environment reference images
3. previous-scene image continuity
4. text-only canonical continuity locks

Reference inputs are resized server-side before being sent. Gemini does not expose a deterministic image seed parameter, so StoryFrame keeps its deterministic scene seed as continuity metadata and a stable prompt anchor; `Regenerate Same` is not guaranteed to be pixel-identical.

### Fallback: Pollinations

If Vertex AI is unavailable, unconfigured or returns an error, StoryFrame automatically falls back to the public Pollinations image URL with:

```text
model=flux-anime
```

Pollinations fallback remains deterministic through the same compiled prompt and preserved seed, but it is treated as text-to-image only and is never falsely labelled as reference-conditioned.

## Environment variables

```env
STORYFRAME_DEFAULT_IMAGE_PROVIDER=gemini

VERTEX_AI_PROJECT_ID=
VERTEX_AI_LOCATION=global
VERTEX_AI_API_KEY=
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-9b

POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_MANGA_TEXT_MODEL=openai-fast
POLLINATIONS_TEXT_MODEL=openai
POLLINATIONS_IMAGE_MODEL=flux-anime
POLLINATIONS_ANALYZE_TIMEOUT_MS=90000
POLLINATIONS_IMAGE_TIMEOUT_MS=90000
```

`VERTEX_AI_API_KEY` must be a Google Cloud authorization key permitted to call Vertex AI (`aiplatform.googleapis.com`). The provider also accepts `GOOGLE_CLOUD_API_KEY` or the legacy `GEMINI_API_KEY` variable as aliases, but those values must still be Google Cloud authorization keys, not ordinary AI Studio keys.

Never commit real Google Cloud, Cloudflare or Pollinations credentials. Keep them in Vercel Environment Variables.

## Important routes

- `POST /api/manga/analyze-continuity` — cinematic chapter analysis with the persistent project bible
- `POST /api/manga/reference-continuity` — canonical character reference generation through Vertex AI primary / Pollinations fallback
- `POST /api/manga/image-continuity` — reference-aware scene generation through Vertex AI primary / Pollinations fallback
- legacy image routes use the same provider fallback layer so older pages do not diverge from the current pipeline

## Prompt compiler order

Final prompts are assembled from bounded stable blocks:

**Master Style → World Lock → Location Lock → Character Locks → Prop / Vehicle Locks → Previous Scene Memory → Current Action → Camera / Composition → Lighting → Continuity Commands → Avoidance Lock**

Scene 40 does not contain scenes 1–39. Only permanent canon, relevant current entities and the compact previous-scene record are used.

## Storage

The Cinematic Continuity Studio persists project data in IndexedDB so chapters, canonical references, visual bible data, generated scene state and continuity records survive reloads.

## Development

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run typecheck
npm run lint
npm run build
```
