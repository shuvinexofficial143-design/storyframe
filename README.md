# StoryFrame AI — Manga & Webtoon Continuity Studio

StoryFrame is now a project-based manga/webtoon continuity workspace.

## Main workflow

**Project → Chapter → Gemini Story Analysis → Global Character/Place Library → Canonical Scene Prompts → Pollinations Flux Images → Narration → Export**

## Core features

- Multiple projects with project selector
- Multiple chapters inside each project
- IndexedDB persistence for projects, chapters, references, prompts and generated image previews
- Gemini cross-chapter analysis
- Automatic extraction of new characters and locations
- Global project reference library
- Existing references are never overwritten during later chapter analysis
- Exact locked character/location reference tokens are appended to every scene prompt
- Editable character appearance, outfit, eyes, hair, key features and reference prompt
- Optional manual character reference image upload for project documentation
- Editable location architecture, lighting, palette and environment token
- Stable deterministic scene seeds
- Regenerate with a new seed
- Pollinations Flux server-side generation
- Image download, prompt copy and narration copy
- Project JSON export
- Legacy StoryFrame pages remain available under their original routes

## Environment variables

```env
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=gemini-3.5-flash-lite
GEMINI_ANALYZE_TIMEOUT_MS=30000

POLLINATIONS_API_KEY=
POLLINATIONS_IMAGE_MODEL=flux
POLLINATIONS_IMAGE_TIMEOUT_MS=60000
```

Keep both API keys server-side in Vercel Environment Variables. Never hard-code them into the repository or client bundle.

## API routes

- `POST /api/manga/analyze` — sends the current chapter plus the existing project reference library to Gemini and returns structured scenes + only genuinely new references.
- `POST /api/manga/image` — securely proxies a 1024×576 Flux image request to Pollinations using the scene's canonical prompt and stable seed.

## Cross-chapter continuity

When Chapter 2 is analyzed, the complete Character/Location Reference Library from Chapter 1 is sent to Gemini. Existing references keep their stored visual tokens. New references are appended to the project library. Scene prompts are then rebuilt with the exact locked reference strings stored in the project.

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
