> **Update: the app is now a single Next.js project.** Route handlers live in `app/api/**` (same URLs/JSON as below), pages in `app/`, components in `components/`, shared server code in `lib/` (db, upload streaming, Range media). The Express/Vite layout described below is historical; the API contract itself is unchanged. Data: `data/db.json`, uploads: `uploads/`.

# VideoReview contract (shared by all agents)

Server: Express on :4000 (ESM). Client: Vite+React on :5173 proxying /api -> :4000.
Storage: JSON file `server/data/db.json` via `server/src/db.js`; media in `server/uploads/`.
No auth. Author name for comments is a free-text string.

## Data shapes
Asset   { id, name, status: 'in_review'|'approved'|'needs_changes', createdAt, versions: Version[] }
Version { id, number (1-based), filename (on disk), originalName, mime, size, createdAt }
Comment { id, assetId, versionId, time (seconds, float), endTime (seconds|null), frame (int|null), text, author, resolved (bool), createdAt }
Share   { token, assetId, createdAt, expiresAt (ISO|null), passphraseHash (string|null), allowComments (bool), allowDownload (bool) }

## API (all JSON unless noted)
Owner: backend/upload agent  (server/src/routes/assets.js)
 GET    /api/assets                      -> Asset[] (newest first)
 POST   /api/assets        multipart field `file`, optional `name` -> Asset (creates version 1)
 GET    /api/assets/:id                  -> Asset
 PATCH  /api/assets/:id    {name?,status?} -> Asset
 DELETE /api/assets/:id                  -> 204 (removes files + comments + shares)
 GET    /api/media/:versionId            -> video bytes with HTTP Range support (206), use sendVideo() from db.js

Owner: sharing/versions agent (server/src/routes/versions.js, shares.js)
 POST   /api/assets/:id/versions multipart `file` -> Asset (appends next version number)
 POST   /api/assets/:id/shares {expiresAt?,passphrase?,allowComments?,allowDownload?} -> Share (never expose hash; add `url: '/s/<token>'`, `hasPassphrase`)
 GET    /api/assets/:id/shares           -> Share[] (hash omitted, `hasPassphrase` bool instead)
 DELETE /api/shares/:token               -> 204
 GET    /api/public/shares/:token        header `x-share-passphrase` optional -> {asset, share:{allowComments,allowDownload,hasPassphrase}, comments} | 401 {error:'passphrase_required'|'bad_passphrase'} | 410 {error:'expired'} | 404
 GET    /api/public/shares/:token/media/:versionId  passphrase via `?p=`; `?download=1` only if allowDownload (else 403). Range supported. Version must belong to the share's asset.
 POST   /api/public/shares/:token/comments {versionId,time,text,author,endTime?,frame?} (passphrase header) -> Comment (403 if !allowComments)

Owner: player/comments agent (server/src/routes/comments.js)
 GET    /api/assets/:id/comments?versionId= -> Comment[] sorted by time
 POST   /api/assets/:id/comments  {versionId,time,endTime?,frame?,text,author} -> Comment
 PATCH  /api/comments/:id {text?,resolved?} -> Comment
 DELETE /api/comments/:id -> 204

## Client routes
 /            Library        (backend/upload agent)   client/src/pages/Library.jsx
 /asset/:id   AssetPage      (player/comments agent)  client/src/pages/AssetPage.jsx
 /s/:token    SharePage      (sharing/versions agent) client/src/pages/SharePage.jsx

Shared and already written (do NOT edit): server/src/db.js, server/src/index.js, client/src/api.js, client/src/App.jsx, client/src/main.jsx.
styles.css: append only inside your own block, marked `/* ==== <agent> ==== */`.

## Reusable components (owner builds; others import by these exact paths/props)
 client/src/components/VideoPlayer.jsx   (player/comments agent)
   props: { src, fps=24, comments=[], onTimeUpdate?(t), seekRef? }
   Frame-accurate: `,` and `.` step one frame, J/K/L, Space play/pause, timecode HH:MM:SS:FF, comment markers on the scrub bar. `seekRef.current = (t)=>void`.
 client/src/components/CommentPanel.jsx  (player/comments agent)
   props: { comments, currentTime, fps, onSeek(t), onAdd({time,endTime,text,author}), onToggleResolved(c), onDelete(c), readOnly=false }
 client/src/components/VersionSwitcher.jsx (sharing/versions agent)
   props: { versions, value (versionId), onChange(versionId) }
 client/src/components/ShareDialog.jsx   (sharing/versions agent)
   props: { assetId, onClose }
 client/src/components/UploadVersionButton.jsx (sharing/versions agent)
   props: { assetId, onUploaded(asset) }

AssetPage (player/comments agent) renders VersionSwitcher, UploadVersionButton and a "Share" button opening ShareDialog, plus a status selector (PATCH asset). Stubs for all components exist; replace content, keep the props.
SharePage (sharing/versions agent) reuses VideoPlayer + CommentPanel (readOnly when !allowComments).
Library (backend/upload agent): grid of assets, drag-and-drop/click upload with progress (XMLHttpRequest), rename, delete, status badge, link to /asset/:id.

---
# CONTRACT v2 (evidence-driven update; see FINDINGS.md — rows marked UPDATE)

db.js now also has `db.activity` (array) and migrates old statuses. Shared files stay read-only for agents (db.js, index.js, api.js, App.jsx, main.jsx).

## Changed shapes
Asset.status: 'needs_review' | 'in_progress' | 'approved'   (default 'needs_review'; old 'in_review'/'needs_changes' are migrated)
Comment adds: parentId (string|null; replies), completedAt (ISO|null), completedBy (string|null), durationFrames (int|null; range length in frames, keep endTime too), anchor ({x,y} each 0..1 | null), internal (bool, default false), authorEmail (string|null)
  - A reply inherits `internal` and `versionId`/`time` of its parent and has parentId set. Top-level comments: parentId null.
  - `frame` (int|null) = Math.round(time*fps) when the client knows fps.
Share adds: name (string), enabled (bool, default true), showAllVersions (bool, default true), theme ('dark'|'light'|'neutral', default 'dark'), accentColor (hex|null), description (string|'')
Activity { id, shareToken, assetId, type: 'open'|'view'|'comment'|'download', who (string|null), at }

## Changed / new API
Owner B (comments.js): POST /api/assets/:id/comments accepts parentId, anchor, internal, durationFrames, frame, authorEmail. PATCH /api/comments/:id accepts {text?, completed?: bool (sets/clears completedAt+completedBy), completedBy?}. GET /api/assets/:id/comments?versionId= returns ALL comments incl. replies and internal (owner side). GET /api/assets/:id/comments/export?versionId=&format=csv|json -> file download (CSV columns: timecode,author,text,internal,completed,created_at; json = array).
Owner C (shares.js): create/update shares with the new fields; PATCH /api/shares/:token {name?,enabled?,expiresAt?,allowComments?,allowDownload?,showAllVersions?,theme?,accentColor?,description?,passphrase? (''=remove)}. Public GET: 403 {error:'disabled'} when !enabled; respects showAllVersions (asset.versions trimmed to latest when false); OMITS internal comments (and replies to them) ; appends an Activity 'open'. Public media GET (no download flag) logs 'view' at most once per (token, versionId, minute); `?download=1` logs 'download'. Public comment POST: requires authorName+authorEmail (400 if missing), accepts parentId/anchor/durationFrames/frame, forces internal=false, logs 'comment'. New GET /api/assets/:id/activity -> Activity[] newest first (limit 100).
Owner C (assets.js + Library.jsx): status enum change (validation + default + badges/labels "Needs Review", "In Progress", "Approved"). Do not change anything else there.

## Client component changes
Owner A: client/src/components/VideoPlayer.jsx, CompareViewer.jsx (NEW)
  VideoPlayer props now: { src, fps=24, comments=[], onTimeUpdate?(t), seekRef?, onAddAnchor?({x,y,time}) , pinMode?, markIn?, markOut?, onMarksChange?({inTime,outTime}), onRequestComment?() , initialTime? }
   - Shortcuts exactly: Space/K play-pause; L/J shuttle forward/reverse cycling 2x,4x,8x with an on-video speed indicator (J reverse may be emulated by stepping currentTime back on a timer); ArrowLeft/Right 1 frame; Shift+Arrow 10 frames; I / O set in/out (calls onMarksChange); Shift+I / Shift+O jump to in/out; R toggle range from current marks; C calls onRequestComment (and pauses); F fullscreen; M mute; Ctrl+L toggle loop; `?` toggles a shortcut-help overlay. Ignore when focus in input/textarea/select. Remove the old `,` `.` and 5s arrow behaviour.
   - Speed slider 0.25–1.75 step 0.05 (replace select), Loop toggle button, in/out brackets drawn on the scrub bar, a pin-tool button toggling pinMode: when pinMode is on, clicking the video calls onAddAnchor({x,y,time}) with x,y normalized 0..1 of the video box; show anchored comments (those with anchor and within ±0.5s of the playhead) as pins over the video; clicking a pin seeks to it.
  CompareViewer props: { srcA, srcB, labelA, labelB, fps=24, onClose } — two videos side by side, one shared control bar (play/pause, scrub, frame step with ArrowLeft/Right, speed), a "Linked" toggle (default on = playback+time synced; off = each side independent with its own play button), clicking a side's header marks it "active" and calls optional onActiveChange('A'|'B'); close button. Keep to the CSS block `/* ==== player ==== */` (append) or a new `/* ==== compare ==== */` block.
Owner B: CommentPanel.jsx, AssetPage.jsx, comments.js
  CommentPanel props now: { comments, currentTime, fps, onSeek(t), onAdd({time,endTime,durationFrames,text,author,anchor,internal,parentId}), onToggleResolved(c), onDelete(c), readOnly=false, pendingAnchor?, onClearAnchor?, marks?{inTime,outTime}, focusSignal? (increment to focus the composer), exportUrl?, showInternalToggle=true }
   - Threads (replies nested under parent with a Reply button; replies are not sorted/filtered separately), "Mark complete" (completed state shown, completer), Internal/Public toggle (lock icon on internal; replies inherit), sort dropdown Timecode(default)/Newest/Oldest/Commenter/Completion, filter All/Open/Completed + person filter, Copy link (copies `${location.origin}${location.pathname}?v=<versionId>&t=<seconds>`), Export CSV / JSON links via exportUrl, timestamp toggle for "general" comment (time null allowed? keep time required; the toggle just stores time=0 and a `general:true` is NOT needed — simply label it) — SKIP the toggle, not required.
  AssetPage: status selector uses the 3 new statuses; read `?v=` and `?t=` query params on load to select version and seek; wires I/O marks into CommentPanel (range comments store endTime + durationFrames), pinMode + pendingAnchor flow (pin placed -> composer shows "pinned at x,y"), `C` shortcut -> focus composer; a "Compare versions" button (enabled when >=2 versions) opening CompareViewer full-width with two version selectors; shows ShareDialog's activity? NO (C's ShareDialog shows activity).
Owner C: ShareDialog.jsx, SharePage.jsx, VersionSwitcher.jsx, UploadVersionButton.jsx, shares.js, versions.js, assets.js (status only), Library.jsx (status badges only)
  ShareDialog: create + EDIT existing links (name, enabled toggle, passphrase set/remove, expiry, allow comments/download, show all versions, theme + accent color, description), copy link, revoke, and a "Recent activity" list (GET /api/assets/:id/activity). SharePage: applies theme/accent/description/name, name+email gate shown before the first comment (kept in component state only — not localStorage), hides internal comments (server already omits), supports replies (CommentPanel handles UI), shows disabled / expired / passphrase states, when showAllVersions=false shows only the latest version and hides the switcher.
