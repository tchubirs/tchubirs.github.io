# fedimod

**Shared, privacy-preserving anti-spam signals for ActivityPub servers.**

Every Fediverse server fights spam alone. When a campaign hits `mastodon.social`,
nothing it learns reaches the 200-user instance that gets hit twenty minutes later.
Small servers — the ones decentralisation depends on — carry the same moderation
burden as large ones with none of the staff.

fedimod lets servers share what they learn about a spam campaign **without sharing
what their users wrote**.

---

## How it works

A server computes a 64-bit **SimHash** digest of a message. Similar messages produce
similar digests, so a rewritten spam post still matches — unlike a cryptographic hash,
where changing one character changes everything.

Servers publish a feed of digests they consider abusive. Other servers ingest those
feeds. When the same campaign is independently reported by several servers, that
becomes one input to a local score.

**What crosses the network:** 64-bit digests and counts.
**What never crosses:** message text, URLs, usernames, account identifiers.

```js
import { scoreActivity, SignalStore } from "fedimod";

const store = new SignalStore();
store.ingest(await fetchPeerFeed("peer.example"), "peer.example");

const result = scoreActivity({
  text: incoming.content,
  createdAt: account.createdAt,
  postsLastHour: account.recentPostCount,
  mentions: 12, mentionsToFollowers: 0,
  following: 1900, followers: 4,
  hasAvatar: false, hasBio: false, hasDisplayName: false,
  reportingServers: store.reportingServers(digest),
});

// { score: 0.71, verdict: "quarantine", digest: "500aa4ab110d4309",
//   signals: [ { name: "federatedReports", value: 1, contribution: 0.22 }, … ],
//   explanation: "Score 0.71 (quarantine). Signals fired: …" }
```

---

## Design commitments

These are constraints the code enforces, not aspirations.

**No signal reads meaning.** Every signal looks at behaviour and shape: account age,
posting burst rate, mentions to non-followers, follow asymmetry, link density, profile
completeness, self-repetition, federated reports. Nothing classifies *what was said*.
This keeps the system language-neutral, privacy-preserving, and contestable.

**Every score carries its reasons.** `scoreActivity` never returns a bare number. It
returns the list of signals, each with its value and its contribution, sorted by weight.
A moderator can audit it; a user can appeal it. A neural classifier that says "0.87 spam"
gives neither of them anything to work with.

**No single signal can act alone.** Weights are chosen so that every signal at maximum
still lands below the quarantine threshold. Verified by test: pushing any one input to
an extreme never produces a quarantine verdict on an otherwise-clean account.

**A hostile server cannot silence anyone.** One server reporting the same content fifty
times counts once, and one server alone never reaches the confirmation minimum. Both
verified by test.

**Frugal by construction.** Zero runtime dependencies. Pure ESM. Runs on Node 20+.
The whole library is a few hundred lines, auditable in an afternoon.

---

## Threat model

| Attack | Defence |
|---|---|
| Malicious server mass-reports legitimate content to silence a user | A server counts once per campaign; below `MIN_INDEPENDENT_SERVERS` the signal is zero |
| Server inflates its influence by repeat-reporting | Reports are keyed by server, not by count |
| Server floods peers to exhaust memory | `MAX_REPORTS_PER_SERVER_PER_HOUR` rate limit per source |
| Spammer rewrites text to evade matching | SimHash over normalised 3-word shingles; accents, case, URLs and handles are folded to tokens |
| Stale reports linger and cause false positives | Reports expire after a configurable retention window |

---

## Status

Early. The scoring core, the fingerprinting, and the exchange store are implemented
and tested (20 tests, Node 20/22/24). Not yet integrated into any server implementation
— that is the next milestone.

## Run the tests

```bash
npm test
```

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).

The protocol itself is specified in [SPEC.md](SPEC.md) and is free for anyone to
implement under any licence — an anti-spam network is worthless if only one codebase
can join it.
