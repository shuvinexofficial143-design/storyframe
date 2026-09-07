# StoryFrame AI — Manga & Webtoon Continuity Studio

StoryFrame is a project-based manga/webtoon continuity workspace.

## Main workflow

**Project → Chapter → Fast Pollinations Story Analysis → Character/Place Library → Canonical Character Reference Images → Locked Scene Prompts → Public Flux-Anime Scene Images → Narration → Export**

## Core features

- Multiple projects and chapters
- IndexedDB persistence
- Pollinations-powered cross-chapter story analysis
- Fast `openai-fast` chapter analyzer by default
- 90-second minimum analysis timeout to avoid premature aborts
- Automatic extraction of recurring characters and locations
- Continuity-aware local fallback that still creates stable recurring references
- Automatic canonical character portrait generation with public `flux-anime`
- Manual character reference image upload or AI reference regeneration
- Exact locked character/location tokens appended to scene prompts
- Stable identity seed reused across scenes featuring the same primary character
- Public Pollinations image generation through `https://image.pollinations.ai/prompt/...`
- Hard-set `model=flux-anime` for manga/anime visuals
- Image download, prompt copy, narration copy and project JSON export

## Environment variables

```env
POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=https://gen.pollinations.ai

POLLINATIONS_MANGA_TEXT_MODEL=openai-fast
POLLINATIONS_ANALYZE_TIMEOUT_MS=90000
POLLINATIONS_IMAGE_TIMEOUT_MS=90000

# Legacy StoryFrame text routes only
POLLINATIONS_TEXT_MODEL=openai
```

`POLLINATIONS_API_KEY` is still used by the server-side text-analysis route. The manga image and character-reference routes do **not** use a protected image API endpoint.

## API routes

- `POST /api/manga/analyze` — analyzes the chapter with the existing project library and returns scenes + only genuinely new references. If the live text model is unavailable, a local continuity-aware fallback is used.
- `POST /api/manga/reference` — creates one canonical public `flux-anime` portrait for a recurring character using a preserved identity seed.
- `POST /api/manga/image` — creates scene images through the public Pollinations URL with `model=flux-anime`, the existing scene seed, and the fully locked character/location continuity prompt.

## Public image URL

Scene/reference generation uses the public pattern:

```text
https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&model=flux-anime&nologo=true&seed=${seed}
```

The backend fetches that public URL and returns a data URL to the UI for preview/download.

## Continuity behavior

The continuity engine still preserves:

- exact canonical character names
- locked face/eye/hair/outfit descriptions
- location/environment lock strings
- stable identity seed
- chapter-to-chapter reference library

The public `flux-anime` endpoint is text-to-image. Stored/uploaded reference images remain in the project library, but the scene route no longer sends them to a protected image-edit endpoint. Continuity therefore relies on the locked canonical prompt tokens plus the preserved seed.

## Cross-chapter continuity

Chapter 2 receives the complete Character/Location Reference Library from Chapter 1. Existing references are not redesigned. Newly discovered references are appended to the project library. The same canonical descriptions and stable identity seeds are reused in later chapters.

## Storage

The Continuity Studio uses IndexedDB (`storyframe-manga-continuity`) so project/reference/image data does not immediately overflow localStorage.

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
