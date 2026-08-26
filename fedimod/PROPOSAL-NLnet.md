# NLnet — Open Social Fund application

> Draft for the **3 November 2026** deadline. Calls reopen 3 September 2026.
> Submit at <https://nlnet.nl/propose/> — the form is short; each section below maps
> to one form field.

---

## Project name

**fedimod — federated abuse signals for the Fediverse**

## Website / code repository

*(the public repository URL, once created)*

## Requested amount

**€38,000**

## Abstract (one paragraph, plain language)

Every server in the Fediverse fights spam on its own. When a coordinated campaign hits
one instance, nothing it learns reaches the next instance the campaign targets twenty
minutes later. This falls hardest on small and volunteer-run servers — precisely the
ones decentralisation depends on — because they carry the same moderation load as large
ones without the staff. fedimod is a small, dependency-free library and an open protocol
that lets servers share what they learn about an abuse campaign **without sharing what
their users wrote**: servers exchange 64-bit similarity digests and counts, never
content, URLs, or identifiers. Crucially, a remote signal alone can never act — it can
only confirm what a server's own behavioural signals already suggest, which is what
separates a shared defence from a distributed censorship tool.

## What is the existing situation, and what do you want to change?

Anti-spam in the Fediverse today is either **manual** (admins block domains by hand,
often after the damage) or **siloed** (each server's automation learns only from itself).
The shared artefacts that do exist are human-curated domain blocklists, which are coarse
— they punish every user on a domain for the behaviour of some — and slow, since a
campaign can run for days before a blocklist entry appears.

What is missing is the layer in between: a machine-readable, privacy-preserving way for
servers to notice **the same campaign** independently and quickly, at the granularity of
content rather than whole domains.

We want a small server to benefit from the detection capability of the whole network
while disclosing nothing about its users, and while remaining fully in control of what
it does with the information.

## Why is this a good idea, and why now?

Three things make this tractable now that were not before:

1. **ActivityPub is the settled substrate.** The interoperability problem is solved; the
   moderation-at-scale problem is what remains.
2. **Similarity hashing is cheap and well understood.** SimHash over shingles gives
   robust near-duplicate detection in 64 bits with no model, no training data, no GPU,
   and no vendor. It fits the frugality this fund asks for.
3. **The failure mode is now visible.** Spam waves in the Fediverse have repeatedly shown
   that per-server defence does not scale down to volunteer admins.

## How is it different from existing efforts?

- **Domain blocklists** (Oliphant, FediBlock and similar) act on whole servers and depend
  on human curation. fedimod acts on content similarity, automatically, and is
  complementary — not a replacement.
- **Per-application moderation tooling** (Mastodon's own filters, GoToSocial's federation
  controls, Draupnir for Matrix) improves what one server can do alone. fedimod is the
  layer *between* servers, and is deliberately implementation-agnostic.
- **Commercial anti-spam APIs** require sending content to a third party, which is
  disqualifying for a network whose premise is self-hosting.
- **ML classifiers** produce a score with no defensible explanation. Every fedimod score
  ships with the list of signals that produced it, so a moderator can audit it and a user
  can appeal it.

We searched NLnet's funded-project list before proposing this: moderation appears only
*inside* individual applications (Matrix, GoToSocial, PeerTube). No funded project
addresses shared abuse signalling between servers.

## Who is behind it?

A single independent developer, working in the open. This is a deliberately small,
auditable project — a few hundred lines of dependency-free code plus a specification —
not a platform.

## Technical approach and main challenges

The core is implemented and tested already (20 tests across Node 20/22/24):

- **Fingerprinting** — SimHash over normalised 3-word shingles. Normalisation folds
  case, accents, homoglyph decompositions, URLs and handles, since rotating the
  destination domain is the cheapest evasion available.
- **Behavioural signals** — account age, posting burst rate, mentions to non-followers,
  follow asymmetry, link density, profile completeness, self-repetition, and federated
  reports. No signal reads meaning, which keeps the system language-neutral and
  contestable.
- **Exchange store** — per-server report accounting, rate limiting, and expiry.

The open challenges, honestly stated:

1. **Calibration without a public corpus.** There is no labelled Fediverse spam dataset.
   Weights today are reasoned, not fitted. Milestone 3 addresses this with an
   opt-in, privacy-preserving evaluation harness rather than a data grab.
2. **Bootstrapping trust between servers.** v1 treats all peers as equal and defends
   with rate limits and an independence minimum. A reputation layer is deliberately
   deferred — it is where such systems usually acquire their worst failure modes.
3. **Adoption.** A signal network is worth nothing with two participants. Milestone 4
   is a reference integration for one real server implementation, because a library
   nobody can install does not count as delivered.

## Milestones

| # | Deliverable | Budget |
|---|---|---|
| 1 | Core library and v1 protocol specification, tested, AGPL-3.0, published | €6,000 |
| 2 | Reference feed server: publish/ingest endpoints, rate limiting, retention, operator docs | €9,000 |
| 3 | Evaluation harness and calibration study; weights re-derived from measured behaviour and published with the method | €10,000 |
| 4 | Reference integration with one existing ActivityPub server implementation, upstreamed or maintained as a plugin | €10,000 |
| 5 | Security review response, threat-model write-up, and specification v1.0 finalisation | €3,000 |
| | **Total** | **€38,000** |

Milestone 1 is substantially complete at the time of application and is included so the
reviewer can assess real code rather than a promise.

## Licence

**AGPL-3.0-or-later** for the implementation. The **specification is unencumbered** and
free for anyone to implement under any licence — an anti-spam network that only one
codebase can join is not a network.

## Comparable / related standards work

W3C ActivityPub; the SocialCG's ongoing moderation discussions. Where this work suggests
a protocol-level extension, we will bring it to the SocialCG rather than shipping a
private extension.

---

## Notes for the applicant — read before submitting

- **The fund is closed until 3 September 2026.** The form will not accept a submission
  before then. First deadline after reopening: **3 November 2026**.
- The repository must be **public** and the tests must be **green** before you submit.
  NLnet reviews delivered work, not promises — that is the whole reason milestone 1 is
  already built.
- Fill in your own name, address and IBAN. Individuals are explicitly eligible; no
  company or VAT number is required to apply.
- Requested amount is a judgement call. €38,000 sits inside the €5,000–€50,000 band and
  is defensible against the milestone breakdown. Lowering it does not obviously raise
  the odds; padding it does lower them.
