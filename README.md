# StoryFrame AI

StoryFrame AI turns a pasted story chapter into a visual production pipeline:
- real AI story analysis through Pollinations (with local heuristic fallback)
- character bible with reference portrait generation
- location bible
- scene-by-scene prompts
- storyboard/timeline friendly scene cards

## Stack
- Next.js App Router
- React + TypeScript
- LocalStorage project persistence
- Pollinations unified API for text + image generation

## Environment
Create `.env.local` from `.env.example`.

```env
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_API_KEY=
POLLINATIONS_TEXT_MODEL=openai
POLLINATIONS_IMAGE_MODEL=flux
POLLINATIONS_CONSISTENCY_MODEL=kontext
```

## Key routes
- `POST /api/analyze` → real story analysis via Pollinations, fallback to heuristic extraction
- `POST /api/characters/reference` → generates a reusable character reference portrait
- `POST /api/generate` → generates final scene frames using scene + character + location continuity context

## Local run
```bash
npm install
npm run dev
```

## Notes
- Keep API keys on the server only.
- Generated images are returned as data URIs in this MVP for easy previewing.
- If the live provider fails, the app falls back to mock output instead of fully breaking.
