# StoryFrame AI — Manga Production & Continuity Studio

StoryFrame is a project-based AI manga production system with a preserved **Cinematic Legacy** workspace for the older scene workflow.

The default workspace is now **Manga Studio**.

## Production manga workflow

**Full Story → xKiro Master Analysis → Character / Location / Prop Bible → Timeline + Character State → Tiny Visual Beats → Manga Page Planning → 3–5 Panels per Page → Sequential Panel Generation → Continuity Validation → Optional xKiro Vision QA → Final Page Composer → Speech / Thought / Narration Overlays → Export**

StoryFrame does not ask the image model to create a whole comic page. Each panel is generated as an individual image request and the browser page composer combines those selected panel versions into the final portrait manga page.

### Panel-by-panel storytelling

The manga planner is explicitly instructed not to compress visible action chains. A drawer sequence, for example, is planned as separate beats such as opening the drawer, searching papers, discovering an old photograph, viewing the photograph and reacting to it. Each panel inherits physical state from the prior panel/page so position, pose, direction, outfit, held objects, injuries and location continuity can be carried forward.

Page planning uses 3–5 panels by default and deterministic layout presets. The current page-layout library includes:

- 3 · Large Top
- 3 · Large Bottom
- 4 · 2×2
- 4 · Dramatic
- 4 · Vertical Focus
- 5 · Action

The AI page planner may choose a larger panel for reveals/reactions and smaller panels for faster action or dialogue sequences.

## Manga style presets

The Manga Studio currently supports:

```text
Classic Black & White Manga     (default)
Shonen Manga
Dark Seinen Manga
Shojo Manga
Horror Manga
Cinematic Realistic Manga
```

Panel prompts explicitly request professional black-and-white manga rather than colored anime screenshots, 3D renders or game art. The final Canvas composer also applies a grayscale/contrast guard so an occasional provider color drift does not leak into the exported manga page.

## Story analysis provider

StoryFrame uses xKiro server-side for story understanding and manga planning.

Supported models:

```text
mistralai/mistral-medium-3.5
mistralai/mistral-large-2512
```

Default:

```text
mistralai/mistral-medium-3.5
```

The selected model is persisted and can be changed from the **AI Story Model** selector. The browser never calls xKiro directly and never receives `XKIRO_API_KEY`.

Request flow:

**Browser → StoryFrame server API → xKiro `/v1/chat/completions` → Zod validation / repair retry → Manga project state**

The Manga master analyzer extracts reusable characters, locations, props, timeline events, dialogue and very small sequential visual beats. The page planner processes later beats in bounded chunks and receives the previous continuity state instead of independently re-planning the story from scratch.

The older Cinematic Legacy analyzer retains its previous priority:

1. selected xKiro Mistral model
2. existing Pollinations text analysis
3. existing local continuity fallback

## Character continuity

StoryFrame keeps the existing Character Bible and reference-image system. Each recurring character has stable identity/costume locks, StoryFrame seed metadata and stored reference images.

The reference route supports these assets:

```text
primary portrait
full-body
three-quarter
side profile
multi-view character sheet
```

Manga panel prompt compilation prioritizes canonical character references before location and previous-panel references. When several identity references exist, StoryFrame can include a canonical portrait plus an alternate view/sheet while respecting the image provider reference limit.

Per-panel state can include:

```text
current location
position
body direction
pose
expression
current outfit
held objects
injuries
dirty / wet clothing state
```

The panel prompt compiler uses the exact state planned for that panel rather than accidentally using the final state of a later page.

## Location and prop continuity

Manga analysis stores reusable location profiles with architecture, fixed layout, important props, lighting, time of day and continuity notes. Important objects also keep appearance, owner/current location, condition and continuity instructions.

Before image generation, StoryFrame performs basic continuity checks for duplicated beats, unexplained location jumps, missing visible actions, previous-panel state mismatch and accidental rendered-text instructions.

## Panel generation and versioning

Continuity-sensitive page generation is sequential:

**Panel 1 → save result → Panel 2 → save result → Panel 3 → ...**

The previous generated panel can therefore be supplied as a visual reference when the active image provider supports references.

A panel keeps multiple generated versions instead of deleting the old image. The UI supports:

```text
Regenerate Panel
Stronger Continuity
Reuse Previous Seed
select an older/newer panel version
AI QA
```

`Reuse Previous Seed` preserves StoryFrame seed metadata. Google Vertex Gemini currently does not expose a true deterministic image seed, so the same seed is a continuity anchor rather than a guarantee of pixel-identical output.

## Optional xKiro Vision panel QA

Generated panels can be checked with the same selected xKiro Mistral model through the server-side QA route. QA can compare the generated panel with canonical character references and checks:

```text
story-beat match
character count
identity consistency
outfit continuity
important props
black-and-white manga style
unexpected rendered text
obvious anatomy defects
```

The result is stored on the selected panel version as passed / warning / failed. A clear failure marks the panel **Needs Regeneration**. QA is optional and does not block normal panel generation.

## Final Manga Page Composer

The final page is composed in the browser from the selected panel versions using a portrait 1200×1800 canvas. The composer provides:

- deterministic panel slots
- page margins and gutters
- black panel borders
- crop/fill while preserving slot composition
- final grayscale guard
- structured speech bubbles
- thought bubbles
- narration boxes
- shout styling
- sound-effect overlay support
- page number

Dialogue is kept out of the image-generation prompt. The image model creates text-free art and StoryFrame overlays the real dialogue afterward, avoiding broken AI-generated lettering.

## Story coverage

The Manga Script view displays planned story coverage based on extracted beat IDs. Missing beats remain visible so additional page chunks can be planned instead of silently dropping story events.

## Image provider architecture

StoryFrame keeps the existing modular provider layer under `lib/image-providers/`. xKiro is used for text/vision intelligence; image generation remains separate.

### Primary: Google Cloud Vertex AI Gemini

Default model:

```text
gemini-3.1-flash-image
```

The provider calls the Google Cloud Vertex AI `aiplatform.googleapis.com` GenerateContent endpoint. It is style-neutral: the provider does not overwrite the Manga Studio prompt with an anime/cinematic style.

StoryFrame can send up to four stored references. For manga panels the practical priority is:

1. recurring character identity reference(s)
2. additional visible character reference(s)
3. recurring environment/location reference when space permits
4. immediately previous generated panel when space permits

Reference inputs are resized server-side before being sent.

### Fallback: Pollinations

If Vertex AI is unavailable, StoryFrame retains the existing Pollinations fallback using:

```text
model=flux-anime
```

Fallback results are clearly marked, and Manga Studio adds a QA warning because text-only fallback cannot provide the same reference-conditioned continuity as Vertex Gemini.

## Main production routes

```text
POST /api/manga/production-plan
  action=master  → Character/Location/Prop/Timeline/Tiny Beats
  action=pages   → sequential 3–5 panel page plans using previous continuity state

POST /api/manga/image-continuity
  → individual panel image generation through existing provider fallback layer

POST /api/manga/reference-continuity
  → portrait/full-body/three-quarter/side/character-sheet references

POST /api/manga/panel-qa
  → optional xKiro Vision QA for a generated panel

POST /api/manga/analyze-continuity
  → preserved Cinematic Legacy analysis flow
```

## Existing functionality preserved

The Manga Production layer reuses the existing project architecture instead of rebuilding the application. These existing systems remain available:

- project/chapter autosave in IndexedDB
- xKiro model selector
- Character Bible and identity locks
- Location / Prop / Vehicle references
- Visual Bible and master seed
- Vertex Gemini image generation
- Pollinations fallback
- stored generated images/reference assets
- Cinematic Legacy workspace
- project JSON data

`MangaChapter` now stores the optional Manga production data alongside the existing cinematic scenes, so older projects can migrate without deleting legacy scene data.

## Environment variables

```env
# xKiro story planning + optional vision QA — server-side only
XKIRO_API_KEY=
XKIRO_BASE_URL=https://api.xkiro.com/v1
XKIRO_ANALYZE_TIMEOUT_MS=90000

# Image provider preference
STORYFRAME_DEFAULT_IMAGE_PROVIDER=gemini

# Google Cloud Vertex AI image generation
VERTEX_AI_PROJECT_ID=
VERTEX_AI_LOCATION=global
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image

# Recommended production authentication
VERTEX_AI_SERVICE_ACCOUNT_JSON=
VERTEX_AI_SERVICE_ACCOUNT_BASE64=

# Alternative Google Cloud authorization key permitted for Vertex AI
VERTEX_AI_API_KEY=

# Optional Cloudflare alternate provider
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-9b

# Pollinations legacy/fallback configuration
POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_MANGA_TEXT_MODEL=openai-fast
POLLINATIONS_TEXT_MODEL=openai
POLLINATIONS_IMAGE_MODEL=flux-anime
POLLINATIONS_ANALYZE_TIMEOUT_MS=90000
POLLINATIONS_IMAGE_TIMEOUT_MS=90000
```

`XKIRO_API_KEY` must stay in Vercel Environment Variables. Never create `NEXT_PUBLIC_XKIRO_API_KEY` and never expose the xKiro secret to client-side code.

`VERTEX_AI_API_KEY` must be a Google Cloud authorization key permitted to call Vertex AI (`aiplatform.googleapis.com`). Service-account authentication remains the recommended production path.

Never commit real xKiro, Google Cloud, Cloudflare or Pollinations credentials.

## Storage

StoryFrame persists projects in IndexedDB. Manga production state—including extracted beats, page plans, exact panel states, generated versions, QA results and composed page data—is stored inside the existing chapter/project data model and autosaves with the rest of the project.

Older projects without `analysisModel` automatically migrate to:

```text
mistralai/mistral-medium-3.5
```

## Development / production checks

```bash
npm install
npm run typecheck
npm run lint
npm run build
```
