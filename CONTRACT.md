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
