# Phase 0 — the three measurements that decide the architecture

Measured 31/08/2026 against the live Kick API and CDN, from a Linux container.
Fixtures in `probes/fixtures/`. Probe: `probes/clock-probe.mjs`.

Labels: **[verified]** measured here, primary source · **[owner]** measured by
the owner on his hardware · **[assumed]** reasoned, not measured · **[guess]**.

---

## Decision, and what decided it

**Build it for the browser. Direct CDN fetch, no proxy.**

Decided by measurement 2 alone: the Kick CDN returns
`access-control-allow-origin: *` on the master playlist, the media playlist
**and the segments**, and answers the `OPTIONS` preflight with
`access-control-allow-headers: range`. Byte-range requests return `206`.

That is the whole ballgame. A browser can fetch every byte itself, so the
server hosts static files and nothing else — no bandwidth per user, no proxy
cost, no reason to ship a binary. Measurements 1 and 3 constrain *how* it is
built; they did not decide *where*.

---

## 1. Kick data layer **[verified]**

Four arbitrary channels, none owned by the caller:

| channel | VODs returned | lowest rung | PDT tags in one media playlist |
|---|---|---|---|
| xqc | 23 | 284x160 @ 230 kbps | 3766 |
| trainwreckstv | 10 | 284x160 @ 230 kbps | 1831 |
| adinross | 9 | 284x160 @ 230 kbps | 470 |
| roshtein | 12 | 284x160 @ 230 kbps | 2184 |

`GET https://kick.com/api/v2/channels/<slug>/videos` → `200`, full VOD list for
channels the caller does not own. No auth, no cookie.

**The rendition ladder is identical across all four** (AWS IVS):

```
1920x1080 @60   9 091 454 bps
1280x720  @60   3 491 879
 852x480  @30   1 496 879
 640x360  @30     630 000
 284x160  @30     230 000   ← the rung the grid needs
```

The 160p-class rung the owner hoped for **exists**, at 230 kbps. Thirty of them
is 6.9 Mbps aggregate — a home connection problem, not a server problem.

### The timestamp claim — the owner is wrong, and the fix is better than the claim

The owner believed the m3u8 path encodes absolute start time. Three clocks
exist and they disagree. Measured, in seconds:

| channel | path → API `start_time` | API `start_time` → first `PROGRAM-DATE-TIME` |
|---|---|---|
| xqc | **+7 s** | −2.61 s |
| trainwreckstv | **+52 s** | −4.08 s |
| adinross | **+31 s** | −4.47 s |
| roshtein | **+22 s** | −3.12 s |

The path is `/2026/8/30/20/47/` — **year/month/day/hour/minute, truncated**. It
carries no seconds, so it is wrong by 0–59 s by construction, and the spread
above is exactly that. **Unusable as a sync source.** With 30 angles, a 52-second
error is not drift, it is a different fight.

`EXT-X-PROGRAM-DATE-TIME` replaces it: present on **every segment**, millisecond
precision, and it is the media's own clock rather than a database field written
by the ingest.

```
#EXT-X-PROGRAM-DATE-TIME:2026-08-30T20:47:04.390Z
#EXTINF:10.000,
0.ts
```

`#EXT-X-PLAYLIST-TYPE:EVENT`, `#EXT-X-TARGETDURATION:12`. IVS also emits
`#EXT-X-TWITCH-ELAPSED-SECS` / `#EXT-X-TWITCH-TOTAL-SECS` — a fossil of the
Twitch-derived stack, useful as a cross-check and not to be relied on.

**Sync source, in order:** `PROGRAM-DATE-TIME` → API `start_time` (≈3–4.5 s
late, and consistently late, so a constant correction is defensible) → path
(minute only, last resort, must be labelled as ±30 s in the UI).

**Achievable accuracy [assumed]:** PDT is per segment and segments are ~10 s, so
alignment is exact at segment boundaries and interpolated within one. Frame
accuracy is not reachable from PDT alone — the manual nudge the owner already
specified is therefore mandatory, not a nicety. I have not yet measured
real-world PDT skew *between two channels filming the same event*; that is the
number that decides whether the nudge is used once or constantly, and it needs
two VODs from one Rust night. **Not reached.**

---

## 2. CORS and origin policy **[verified]** — the deciding measurement

With `Origin: https://not-kick.example`:

| resource | status | `access-control-allow-origin` | notes |
|---|---|---|---|
| `master.m3u8` | 200 | `*` | `allow-methods: GET` |
| `160p30/playlist.m3u8` | 200 | `*` | |
| `0.ts` | 200 | `*` | 367 KB |
| `0.ts` with `Range: bytes=0-1000` | **206** | `*` | `content-range` returned |
| `OPTIONS 0.ts` preflight | 200 | `*` | **`allow-headers: range`** |

Confirmed five times across two clients (curl ×3 modes, Node `fetch` ×2). One
earlier probe run recorded `null` on the segment and I could not reproduce it in
five subsequent attempts; recorded here rather than hidden, and the probe now
needs to store raw headers so a future occurrence is provable.

**Consequence:** no proxy. Hosting is a static bundle. Cost per user-hour of
bandwidth: **zero**. Had a proxy been required, 30 streams × 230 kbps × 1 hour
= **3.1 GB per user-hour** — at commodity egress (~$0.09/GB) that is **$0.28 per
user-hour**, which is what kills a free tool: 500 people doing one session each
is roughly $140 for a week, growing with every post.

`Range` support also means the clipper fetches only the segments overlapping the
window, exactly as required — never a whole VOD.

---

## 3. Concurrency ceiling **[owner]** — and why I do not believe the number means what it looks like

The owner measured **≈1000 HLS players at 160p on his laptop, nothing else
running**. I have no 2019-class laptop and no phone in this container, so I
cannot check it, and I will not invent a benchmark. Recorded as his measurement.

I do not think it means 1000 decoding streams, for reasons that are checkable:

- **Chrome caps simultaneous video decoders.** Beyond roughly 75 playing
  `<video>` elements it stops decoding new ones. It does not throw — the element
  just sits there. A test that counts *created players* and a test that counts
  *decoding players* differ by an order of magnitude and look identical.
- **HTTP/2 concurrent streams.** The CDN is HTTP/2 (verified: `HTTP/2 200`), so
  requests multiplex over one connection, bounded by the server's
  `SETTINGS_MAX_CONCURRENT_STREAMS` — commonly ~100. Not fatal, but it is a real
  queue, and it bites hardest during a scrub when every player re-requests at once.
- **Memory.** Each hls.js instance holds a buffer. A thousand of them at even
  10 MB is 10 GB.
- **The test that matters is a different test.** Idle playback is not the load.
  The owner's own brief names the operation that breaks the grid: *scrubbing*,
  with one focus stream at full quality. That was not what was measured.

**Why this does not change the decision.** The product needs 10–30, not 1000.
Even the pessimistic ceiling (~75 decoders) clears 30 with room to spare. So
measurement 3 stops being the architecture decider and becomes a UI budget.
Measurement 2 decided alone.

**To settle it:** count frames, not elements —
`video.getVideoPlaybackQuality().totalVideoFrames` must be *increasing* per
element. A probe page that reports "N created / M actually decoding" while
scrubbing is one file; say the word and I write it.

---

## Degradation strategy the numbers force

1. **Focus stream** — highest rendition the user picks, audio, full buffer.
2. **Warm tiles** — 160p @ 230 kbps, muted, short buffer. Cap at the measured
   decoding ceiling minus a margin, default 24 until measured on real hardware.
3. **Cold tiles** — unmounted. A still refreshed on a slow cadence, resuming on
   demand. Offscreen and background-tab tiles go cold; `document.hidden` and an
   IntersectionObserver decide, not a timer.
4. **During a scrub** — everything except focus goes cold for the duration, and
   warms back on release. This is the only way the grid survives the operation
   that breaks it.

---

## Fallback ladder, if the primary path is ever blocked

Ranked. Kick can revoke CORS silently; the ladder is the contingency.

1. **PWA + optional local companion** — the web app keeps working for playback;
   a small local binary is offered only for export. Least disruption, keeps the
   no-install promise for the common case.
2. **Browser extension** — `declarativeNetRequest` lifts origin restrictions.
   Cheap, but store review is a dependency you do not control.
3. **Tauri desktop app** — no CORS at all, ffmpeg bundled. Highest capability,
   worst reach: an install ceremony contradicts the brief.
4. **Server proxy** — last, and only behind accounts and quotas. At $0.28 per
   user-hour it cannot be free, so it changes the product rather than saving it.

---

## What I may be wrong about

- **The four sample channels are large Western streamers, not Rust streamers.**
  The ladder was identical across all four, which suggests an IVS account-level
  preset rather than a per-channel one — but I have not sampled a small
  Portuguese-language Rust channel, and that is the actual user. **Not reached.**
- **`start_time` has no timezone.** I treated it as UTC because the resulting
  −2.6 to −4.5 s deltas against PDT are consistent and small; a wrong zone
  assumption would show as a whole-hour error, and none appeared. Still an
  assumption.
- **VOD retention and privacy were not tested.** `is_private` and `is_pruned`
  exist in the payload; I did not find a channel exhibiting either, so the
  expired/private/deleted paths are **unverified** and must be treated as
  first-class states in the adapter regardless.
- **The single unreproducible `null`** on a segment's CORS header. If that is a
  real intermittent edge behaviour rather than a probe artefact, the whole
  architecture decision needs a retry policy behind it.
- **Rate limits are unmeasured.** I made ~40 calls and saw no throttling. Thirty
  channels × 500 people is a different regime; the adapter must rate-limit
  before that is discovered in production.

## Deliberately left out

- Kill-feed OCR and audio detection — out of scope by the brief. The event model
  will accept injected markers `{timestamp, label, channel, confidence}`; the
  detectors are not built.
- Accounts, quotas, payment — the seam stays, nothing ships.
- The concurrency probe page — not written yet, waiting on the owner's word,
  because his measurement may already answer it.

## Could not reach

- Measurement 3 on real hardware (no 2019 laptop, no phone here).
- Cross-channel PDT skew for the same real event (needs two VODs from one night).
- Premiere/Resolve import verification of the generated XML/EDL — no licence for
  either in this environment. **This will have to be verified by the owner, or
  shipped labelled as unverified.**

## Capabilities used, and not used

**Used:** live network calls to the Kick API and CDN (the only way to answer 1
and 2); Node `fetch` and `curl` cross-checked against each other because a
single client's behaviour is not evidence; file writes for fixtures; the repo
for the probe and this document.

**Not used, with reason:** web search — the questions were answerable against
the live endpoints, and a blog post from 2024 about Kick's API is worth less
than a `200` today. Browser automation — the CORS answer came from response
headers, which curl reads more honestly than a browser that may be applying its
own cache. Artifact publishing — this is a working document inside the repo, not
a page for an audience.
