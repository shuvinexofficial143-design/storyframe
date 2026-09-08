# StoryFrame AI — Manga & Webtoon Continuity Studio

StoryFrame is a project-based cinematic manga/webtoon continuity workspace.

## Main workflow

**Project → Chapter → Story Analysis → Persistent Visual Bible → Character / World / Location / Prop Bibles → Prompt Compiler → Cloudflare FLUX.2 Reference-Aware Images → Previous Scene Memory → Pollinations flux-anime Fallback → Export**

## Core continuity features

- Multiple projects and chapters with IndexedDB persistence
- Persistent Project Visual Bible and master seed
- Character IDs, identity locks, costume locks and temporary story states
- World, location, prop, artifact and vehicle continuity records
- Master Style Lock and Global Negative / Avoidance Lock
- Cinematic beat-based scene splitting instead of sentence-by-sentence splitting
- Deterministic scene seeds with Regenerate Same / Variation / Lock Seed behavior
- Strict / Balanced / Loose continuity strength
- Compact previous-scene continuity memory instead of endlessly growing prompts
- Pre-generation continuity validation
- Canonical prompt compiler that reuses stable blocks instead of letting the scene LLM redesign established entities
- Canonical character-reference image generation and manual reference uploads

## Image provider architecture

StoryFrame now uses a modular image-provider layer under `lib/image-providers/`.

### Primary: Cloudflare Workers AI

Default model:

```text
@cf/black-forest-labs/flux-2-klein-9b
```

Cloudflare is used when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are configured. The integration uses multipart form data, deterministic `seed`, 16:9 output dimensions, and up to four reference images.

Reference priority is:

1. recurring character reference images
2. recurring environment reference images
3. previous-scene image continuity
4. text-only canonical continuity locks

Reference inputs are server-side resized to fit Cloudflare's small reference-image requirement before being sent.

### Fallback: Pollinations

If Cloudflare is unavailable, unconfigured or returns an error, StoryFrame automatically falls back to the public Pollinations image URL with:

```text
model=flux-anime
```

Pollinations fallback remains deterministic through the same compiled prompt and preserved seed, but it is treated as text-to-image only and is never falsely labelled as reference-conditioned.

## Environment variables

```env
STORYFRAME_DEFAULT_IMAGE_PROVIDER=cloudflare

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

Never commit real Cloudflare or Pollinations credentials. Keep them in Vercel Environment Variables.

## Important routes

- `POST /api/manga/analyze-continuity` — cinematic chapter analysis with the persistent project bible
- `POST /api/manga/reference-continuity` — canonical character reference generation through Cloudflare primary / Pollinations fallback
- `POST /api/manga/image-continuity` — reference-aware scene generation through Cloudflare primary / Pollinations fallback
- legacy `/api/generate`, `/api/characters/reference`, `/api/manga/image`, and `/api/manga/reference` routes also use the same provider fallback layer so older pages do not diverge from the current pipeline

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
