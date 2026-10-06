# Povix: every angle of every play, for Kick events

Draft for a first conversation with Kick (kickpartners@kick.com, business@kick.com). October 2026.
Every number below links to its source; what is our own judgement says so.

## The gap

Kick already runs multi-creator events and sells them as multi-POV. The Rust Kick Off 2 site, © KICK,
says "150 perspectives. One server." ([rustkickoff.com](https://rustkickoff.com/)). The site has
schedules, teams, leaderboards, a heatmap and rules, but no synced replay and no clip tool.

The native tools stop short of that promise:

- Multi-View shows at most 4 live streams on desktop and 2 on mobile web, and only live
  ([Kick help](https://help.kick.com/en/articles/16798355-how-to-watch-multi-view-on-kick)).
- A native clip is one channel, 10 to 180 seconds
  ([Kick help](https://help.kick.com/en/articles/7120566-how-to-create-clips-on-kick)).
- The public API has no video, VOD or clip endpoints ([API spec](https://api.kick.com/swagger/doc.yaml)).

Event staff do this by hand today: the Kick Off 2 rules ask admins to "monitor creator streams and clip
notable moments" ([rules](https://rustkickoff.com/about)).

## Why it matters to Kick

- **The events work.** Rust Kick Off 2 set a Rust record of 311,000 peak viewers and took Kick to 1.8M
  peak, its highest since February 2026
  ([Streams Charts](https://streamscharts.com/news/rust-kick-off-2-recap)). The first edition had 13.85M
  hours watched across 159 channels
  ([Streams Charts](https://streamscharts.com/news/rust-kick-off-2025-viewership-chat-analytics)).
- **Kick already pays for clips.** The Clipping agency's CEO told Bloomberg that Kick pays the agency
  ([The Star / Bloomberg](https://www.thestar.com.my/tech/tech-news/2026/05/03/the-video-clipping-machine-behind-claviculars-viral-fame));
  Kick says its clipping program passed 3 billion views in a month
  ([win.gg](https://win.gg/kick-clipping-program/), Kick's own figure). The expensive part of a good clip
  is finding the right seconds in hours of VOD.
- **Multi-angle edits are original content.** YouTube is cutting the reach of re-uploads "without adding
  anything of your own"
  ([Dexerto](https://www.dexerto.com/youtube/youtube-cracks-down-on-clipping-channels-in-shorts-update-prioritizing-original-content-3415700/)).
  A cut that goes attacker, defender, third party is an edit (our judgement).

## What Povix does (working today, in the browser)

1. **Open a whole event.** Paste the organizer's teams page or any roster; up to 500 channels load in
   under a minute, grouped by team, on one timeline. Channels that fail are named, with the reason.
2. **Pick a moment, see the team.** One click opens that streamer and teammates side by side, in sync to
   the second (each Kick segment carries an absolute clock; audio refines it).
3. **Find the other angles by sound.** Streams that heard the same sound at the same second were there.
   Measured on real Kick VODs: two streamers who played together matched in 55 of 87 windows, two who
   did not matched in 0 of 87.
4. **Live, not only after.** The in-progress VOD runs 2 to 12 s behind live, so the same flow works
   during the event.
5. **Clip.** 16:9 by copying Kick's own segments (no re-encode), 9:16 with a framing editor. A share link
   reopens the event at that play.

No server, no account, no stored video: every viewer's browser reads Kick's CDN directly, which also keeps
within the 24-hour storage rule of the developer terms.

## What we would ask Kick for

- Written permission to read VOD playlists with our own player. Today the developer terms require Kick's
  player and forbid undocumented endpoints
  ([developer terms](https://dev.kick.com/terms-of-service)); this is the main thing to settle.
- An official VOD endpoint with the absolute time of each segment.
- Longer VOD retention for partner-event participants (7 days for unverified channels today).

## Safeguards we build in

- Credit and a link to every streamer in every clip; removal on request; per-event opt-out list.
- One-click mute or audio swap on export, for music claims.
- During live play the sound search only covers moments older than a delay set by the organizer, so it
  cannot be used to find rival teams (the Kick Off rules ban watching rivals mid-game).

## Proposal

A pilot at the next Kick-sponsored event with the organizer's agreement, measuring POVs synced, sync
error, clips made, views and staff minutes saved. Then a per-event license for organizers, or a
Kick-branded license for Kick itself.
