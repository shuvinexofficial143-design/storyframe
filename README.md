# StoryFrame AI

Original cinematic story-to-scene workspace for Novel Explained / visual-story workflows.

**Story → Character Bible → Location Bible → Scene Breakdown → Image Queue → Storyboard → Timeline → Export**

## MVP included
- Next.js 16.3.3 + React 19.2.8 + Tailwind 4.3.3
- Long story editor
- Server-side mock story analyzer
- Automatic cast/location extraction
- Visual scene breakdown with cinematic shots
- Character and location locking
- Editable per-scene prompts
- Server-side mock image generator producing SVG assets
- Generate All queue
- Storyboard and timeline
- localStorage autosave
- JSON export
- Supabase starter schema
- GitHub Actions CI

## Run
```bash
npm install
npm run dev
```
Open http://localhost:3000

Then run:
```bash
npm run typecheck
npm run lint
npm run build
```

## Demo
Open **Story** → **Load demo story** → **Analyze story** → review **Characters/Locations** → open **Scenes** → **Generate all** → review **Storyboard/Timeline**.

The default providers are mock so the end-to-end flow works without spending API credits. Replace `/api/analyze` and `/api/generate` with real server-side provider adapters later.

## Next batches
1. OpenAI/Gemini structured story analysis
2. Character reference-sheet generation and image uploads
3. OpenAI/Google/Replicate/fal image adapters
4. Supabase Auth + cloud project persistence
5. Continuity state timeline and vision-based consistency scoring

## Rights
Only upload or generate from stories you own, are licensed to use, or are otherwise legally permitted to transform.
