# StoryFrame AI — Manga & Webtoon Continuity Studio

StoryFrame is a project-based manga/webtoon continuity workspace.

## Main workflow

**Project → Chapter → Fast Pollinations Story Analysis → Character/Place Library → Canonical Character Reference Images → Locked Scene Prompts → Reference-based Scene Images → Narration → Export**

## Core features

- Multiple projects and chapters
- IndexedDB persistence
- Pollinations-powered cross-chapter story analysis
- Fast `openai-fast` chapter analyzer by default
- 90-second minimum analysis timeout to avoid premature aborts
- Automatic extraction of recurring characters and locations
- Continuity-aware local fallback that still creates stable recurring references
- Automatic canonical character portrait generation with Flux
- Manual character reference image upload or AI reference regeneration
- Exact locked character/location tokens appended to scene prompts
- Stable identity seed reused across scenes featuring the same primary character
- Reference-image scene generation through Pollinations image edits (`klein` by default)
- Automatic Flux fallback if reference-edit mode is unavailable
- Image download, prompt copy, narration copy and project JSON export

## Environment variables

```env
POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=https://gen.pollinations.ai

POLLINATIONS_MANGA_TEXT_MODEL=openai-fast
POLLINATIONS_ANALYZE_TIMEOUT_MS=90000

POLLINATIONS_IMAGE_MODEL=flux
POLLINATIONS_REFERENCE_MODEL=flux
POLLINATIONS_CONSISTENCY_MODEL=klein
POLLINATIONS_IMAGE_TIMEOUT_MS=90000

# Legacy StoryFrame text routes only
POLLINATIONS_TEXT_MODEL=openai
```

Keep `POLLINATIONS_API_KEY` server-side in Vercel Environment Variables. Never hard-code it into the repository or client bundle.

## API routes

- `POST /api/manga/analyze` — analyzes the chapter with the existing project library and returns scenes + only genuinely new references. If the live text model is unavailable, a local continuity-aware fallback is used.
- `POST /api/manga/reference` — creates one canonical Flux portrait for a recurring character.
- `POST /api/manga/image` — when character reference images exist, uses Pollinations image editing to preserve identity; otherwise uses Flux text-to-image.

## Why the new continuity pipeline matters

Prompt text + seed alone does not guarantee the same face across unrelated image generations. StoryFrame now creates a canonical portrait for each recurring character and sends that portrait back into later scene generation. The scene prompt also carries the exact locked visual token and a stable identity seed.

If reference-image editing is unavailable for the current Pollinations account/model, StoryFrame falls back to Flux while keeping the locked prompt and identity seed.

## Cross-chapter continuity

Chapter 2 receives the complete Character/Location Reference Library from Chapter 1. Existing references are not redesigned. Newly discovered references are appended to the project library. Any existing character reference image is reused when generating the new chapter's scenes.

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
