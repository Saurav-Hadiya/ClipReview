# Frame.io findings (evidence log)

Honest scope: everything below is from PUBLIC pages and public docs. The signed-in app (app.frame.io) was NOT inspected, so player internals, wire formats of the web app and exact UI layout are unknown.

## How evidence was gathered
- REA `capture_browser_scenario` (Chromium, no login): `frame.io/` (ev_428937af…ac52a8f), `/features/review-and-approval` (ev_… file saved in session), `/features/present` (ev_ed88a30a…9d50).
  - Network on the review page (289 events): frame.io 219, cdn.sanity.io 21 (CMS), wistia (demo video embeds), calendly. This is a marketing site; it contains no review-app code or API traffic.
  - Conclusion: bundle/network analysis of the marketing site cannot reveal the review app. `analyze_web_bundle` was therefore NOT run (it would only describe the marketing site).
- Public help center (help.frame.io) and public developer docs (next.developer.frame.io, V4 API reference), read with WebFetch (not REA). These document behaviour and the API data model.

## Observed (documented) behaviour -> what the app implements

| # | Finding (source) | Status in app |
|---|---|---|
| 1 | Shortcuts: Space/K play-pause; L / J play fwd / reverse at 2x,4x,8x; Left/Right = 1 frame, Shift+Left/Right = 10 frames; I / O mark in/out, R mark range, Shift+I/O go to in/out; C add comment; F fullscreen; M mute; Ctrl+L loop; `?` help (help.frame.io keyboard-shortcuts) | UPDATE (agent A) |
| 2 | Playback speed slider 0.25x–1.75x step 0.05; Loop; speed indicator on video (player-page-features) | UPDATE (A) |
| 3 | Comments: timestamped single frame; range comments via in/out ("duration" in frames); typing auto-pauses; click card -> seek, range card plays only the span; timestamp can be toggled off for general comments (commenting-on-your-media; API comments/create) | UPDATE (B) |
| 4 | Anchored comments: click pin tool then click the frame; anchor {x,y} each 0..1 (help + API) | UPDATE (A player pin tool, B storage/list) |
| 5 | Replies thread under a parent comment; replies inherit internal/public of the parent; replies not in filter/sort (comments-panel-overview) | UPDATE (B) |
| 6 | Completed state: `completed_at`, `completer_id` ("mark as complete") (API comment object) | UPDATE (B) |
| 7 | Internal vs Public comments; internal hidden from external share reviewers (commenting) | UPDATE (B server filters internal out of public share responses) |
| 8 | Comment panel: sort Timecode (default) / newest / oldest / commenter / completion; filters (unread, annotated, attachments, hashtag, person); copy link to exact timestamp; export CSV/XML/text/FIOJSON (comments-panel-overview) | UPDATE (B: sort, person filter, copy link `?t=`, export CSV + JSON) |
| 9 | Hashtags `#tag` filter; @mentions; emoji reactions; attachments (max 6) (commenting) | NOT IMPLEMENTED (documented gap) |
| 10 | Annotations: draw arrow/line/box/freehand, stored as JSON geometry string (commenting, API `annotation`) | NOT IMPLEMENTED (documented gap) |
| 11 | Status label values: "Needs Review", "In Progress", "Approved" (player-page-features) | UPDATE (C: status enum `needs_review|in_progress|approved`) |
| 12 | Version stacks; "Compare Versions": side-by-side, linked synced playback/zoom with an unlink toggle, comment attaches to the clicked side (comparison-viewer) | UPDATE (A builds CompareViewer; B wires it into AssetPage) |
| 13 | Share settings: access public/secure, name, enabled toggle, passphrase, expiration, comment toggle, download toggle, show_all_asset_versions, layout grid/list/reel, accent_color, theme dark/light/neutral, description, featured field; short URL (API shares/create, shares-in-frame-io) | UPDATE (C: name, enabled, showAllVersions, theme, accentColor, description; layout/featured field/secure not implemented) |
| 14 | Reviewers on shares enter name + email after first comment, kept for the session only (shares-in-frame-io) | UPDATE (C) |
| 15 | Recent Share Activity feed: opened link, viewed asset, commented, downloaded, with name/date (shares-in-frame-io) | UPDATE (C: db.activity) |
| 16 | Download full-res or proxy; "Download still" of current frame; "Set frame as thumbnail" (player-page-features) | NOT IMPLEMENTED |

## Unknowns (not established by any evidence gathered)
- Real wire format of app.frame.io requests, optimistic-update/real-time (websocket) behaviour, scrub-bar hover preview implementation, how frame-accurate seeking is done internally, permission model beyond public docs.
