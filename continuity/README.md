# fedi-continuity

**Your fediverse identity should survive your server.**

## The problem

On ActivityPub, moving your followers to a new account requires a `Move`
activity **signed by the origin server's key**. If that server is seized,
blocked by a national firewall, or simply shut down by a burned-out admin,
nobody can sign it.

Mastodon's own documentation is explicit about the consequences:

- Migration requires the **old account to stay accessible** — you configure
  the move from the old server's settings.
- Posts and media **cannot be imported at all**, even in the best case.
- If the old server is gone, the only remaining option is manually exporting
  the list of accounts *you* follow.

Your followers — the part you cannot rebuild alone — are lost. You can
re-follow a thousand people yourself. You cannot make a thousand people
re-follow you.

This hits hardest exactly where it matters most: people who left a
centralised platform under censorship, and landed on a small server that a
government, a hosting provider, or exhaustion can remove overnight.

## The idea

Invert whose key does the signing.

While the origin server is **still alive**, the user generates a keypair that
stays with *them* and publishes a short commitment to the public key in their
own profile:

```
fedi-continuity-v1:ZhWL__ho1ppuVlG3cYPaVSNhhfdqCUYG-L68VaC-j2I
```

62 characters — it fits in a Mastodon bio (500 char limit) alongside real text.

Every server that follows this account **already caches a copy of the
profile**. That is how ActivityPub works. So the commitment is already
replicated across the network before anything goes wrong.

Later — even with the origin server dead — the user signs a continuity
statement from the new account. Any server verifies it against the cached
copy it already holds. **The dead server is never contacted.**

## Status

Milestone 1 complete: portable identity and continuity proofs.

- `src/identity.js` — keypair generation, bio-sized commitments, recovery of
  the public key from a published commitment
- `src/proof.js` — issuing and verifying continuity proofs
- 13 tests, no dependencies beyond Node's standard library

```
npm test
```

## Design decisions

**Ed25519, not RSA.** A 32-byte public key becomes 43 base64url characters,
so the whole commitment fits on one line of a profile bio. RSA-2048 would not
fit anywhere a user can edit by hand.

**Proofs expire (30 days by default).** Without an expiry, one leaked key
redirects a person's followers forever. With one, the damage window is bounded
and the legitimate owner can publish a fresh commitment.

**Canonical serialisation.** Signatures cover a string, so the same data must
always produce the same string. `JSON.stringify` preserves key insertion
order, which means equal objects can serialise differently and verification
fails for no visible reason. Keys are sorted.

**Verification returns a reason, it never throws.** The caller is a server
processing an activity queue. A bad proof is routine, not exceptional.

## Licence

AGPL-3.0-or-later.
