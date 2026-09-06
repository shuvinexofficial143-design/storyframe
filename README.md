# StoryFrame AI

StoryFrame AI converts a pasted story or novel chapter into a reusable visual production pipeline for Novel Explained / cinematic narration videos.

## Final workflow

**Story → AI analysis → Character Bible → Character References → Location Bible → Scene Breakdown → Flux/Kontext Image Generation → Storyboard → Timeline → Export**

## What is fixed in this version

- Safe JSON parsing on the client. HTML/plain-text server errors no longer crash with `Unexpected token`.
- Pollinations story analysis uses a timeout and automatically falls back to local scene breakdown if analysis is slow or unavailable.
- Flux is the default text-to-image model.
- Locked character references are passed to the reference-capable consistency model when available.
- If reference-model generation fails, the route retries Flux without references instead of returning a fake mock image.
- Generate All now sends the full scene + characters + location payload.
- Scene cards show model, reference count, seed and readable generation errors.
- Regenerate uses a new seed while preserving character/location continuity instructions.
- Base64 previews are compacted out of localStorage when a reusable source URL exists, reducing browser-storage failures.

## Repository structure

```text
storyframe/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ app/
│  ├─ api/
│  │  ├─ analyze/
│  │  │  └─ route.ts
│  │  ├─ characters/
│  │  │  └─ reference/
│  │  │     └─ route.ts
│  │  └─ generate/
│  │     └─ route.ts
│  ├─ characters/
│  │  └─ page.tsx
│  ├─ locations/
│  │  └─ page.tsx
│  ├─ projects/
│  │  └─ page.tsx
│  ├─ scenes/
│  │  └─ page.tsx
│  ├─ settings/
│  │  └─ page.tsx
│  ├─ story/
│  │  └─ page.tsx
│  ├─ storyboard/
│  │  └─ page.tsx
│  ├─ timeline/
│  │  └─ page.tsx
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ app-shell.tsx
│  ├─ project-provider.tsx
│  ├─ scene-card.tsx
│  └─ ui.tsx
├─ lib/
│  ├─ default-project.ts
│  ├─ fetch-json.ts
│  ├─ pollinations.ts
│  └─ types.ts
├─ supabase/
│  └─ schema.sql
├─ .env.example
├─ .gitignore
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
├─ postcss.config.mjs
├─ tsconfig.json
└─ README.md
```

## Pollinations configuration

Create `.env.local` from `.env.example`:

```env
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_API_KEY=
POLLINATIONS_TEXT_MODEL=openai
POLLINATIONS_IMAGE_MODEL=flux
POLLINATIONS_CONSISTENCY_MODEL=kontext
POLLINATIONS_ANALYZE_TIMEOUT_MS=10000
POLLINATIONS_IMAGE_TIMEOUT_MS=45000
```

`POLLINATIONS_API_KEY` may be left empty when the public endpoint/model is available. Availability, quotas and model access are controlled by Pollinations.

## Recommended consistency workflow

1. Paste and analyze the story.
2. Open **Characters**.
3. Generate a reference image for every recurring character.
4. Edit appearance/outfit notes until each reference is correct.
5. Lock the approved characters.
6. Open **Scenes** and run **Generate all scenes**.
7. Review weak scenes and regenerate them individually with a new seed.
8. Review the final sequence in **Storyboard** and **Timeline**.

## Local run

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

## Models

- `flux` — default text-to-image and character reference generation.
- `kontext` — reference-aware scene generation when character reference URLs are available.

Pollinations exposes multiple image models and its model list can change over time, so model names are kept configurable through environment variables.

## Content rights

Only upload or generate from stories you own, are licensed to use, or are otherwise legally permitted to transform.
