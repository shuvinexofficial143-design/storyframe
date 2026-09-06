# StoryFrame AI — Manga & Webtoon Continuity Studio

StoryFrame is a project-based manga/webtoon continuity workspace.

## Main workflow

**Project → Chapter → Pollinations Story Analysis → Global Character/Place Library → Canonical Scene Prompts → Pollinations Flux Images → Narration → Export**

## Core features

- Multiple projects with project selector
- Multiple chapters inside each project
- IndexedDB persistence for projects, chapters, references, prompts and generated image previews
- Pollinations-powered cross-chapter story analysis
- Automatic extraction of new characters and locations
- Global project reference library
- Existing references are never overwritten during later chapter analysis
- Exact locked character/location reference tokens are appended to every scene prompt
- Editable character appearance, outfit, eyes, hair, key features and reference prompt
- Optional manual character reference image upload for project documentation
- Editable location architecture, lighting, palette and environment token
- Stable deterministic scene seeds
- Regenerate with a new seed
- Pollinations Flux server-side image generation
- Image download, prompt copy and narration copy
- Project JSON export
- Local continuity-aware fallback if Pollinations text analysis is unavailable
- Legacy StoryFrame pages remain available under their original routes

## Environment variables

```env
POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_TEXT_MODEL=openai
POLLINATIONS_IMAGE_MODEL=flux
POLLINATIONS_CONSISTENCY_MODEL=kontext
POLLINATIONS_ANALYZE_TIMEOUT_MS=30000
POLLINATIONS_IMAGE_TIMEOUT_MS=60000
```

Keep `POLLINATIONS_API_KEY` server-side in Vercel Environment Variables. Never hard-code it into the repository or client bundle.

## API routes

- `POST /api/manga/analyze` — sends the current chapter plus the existing project reference library to Pollinations text analysis and returns structured scenes plus only genuinely new references.
- `POST /api/manga/image` — securely proxies a 1024×576 Flux image request to Pollinations using the scene's canonical prompt and stable seed.

## Cross-chapter continuity

When Chapter 2 is analyzed, the complete Character/Location Reference Library from Chapter 1 is sent with the new chapter to the Pollinations text model. Existing references keep their stored visual tokens. New references are appended to the project library. Scene prompts are then rebuilt with the exact locked reference strings stored in the project.

If the Pollinations text call fails or no API key is configured, StoryFrame falls back to local continuity-aware scene splitting and still reuses matching existing character/location references.

If a reference token is edited later, scenes that use that reference are marked stale, their old image preview is cleared, and their prompts are rebuilt while retaining the scene seed.

## Storage

The Continuity Studio uses IndexedDB (`storyframe-manga-continuity`) rather than localStorage so generated image data does not immediately overflow the browser's small localStorage quota.

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
