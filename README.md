# VideoReview

Frame-accurate video review (upload, timestamped comments, versions, share links) as one Next.js app.

```bash
npm install
npm run dev      # http://localhost:3000
# or
npm run build && npm start
```

- API: `app/api/**` route handlers. Pages: `app/`. Components: `components/`. Server helpers: `lib/`.
- Data: `data/db.json`. Uploads: `uploads/` (streamed to disk, Range streaming for playback).
- Behaviour notes and evidence: `FINDINGS.md`. API/data contract: `CONTRACT.md`.
