# Federated Abuse Signal Exchange — v1 (draft)

Status: **draft**. Implemented by `fedimod`, but deliberately specified apart from it.
An anti-spam network is worthless if only one codebase can join it, so this document is
the contract and the reference implementation is just one participant.

---

## 1. Goals and non-goals

**Goals**

- Let independent servers learn that a spam campaign is hitting more than one of them.
- Reveal nothing about message content, authors, or recipients.
- Make a hostile participant unable to silence a user.
- Be implementable in an afternoon in any language.

**Non-goals**

- Deciding what is abusive. That stays a local policy decision on every server.
- Identity, reputation of users, or cross-server user tracking.
- Replacing existing per-server moderation tooling.

---

## 2. Content digest

A digest is a 64-bit SimHash of the normalised message text, serialised as 16 lowercase
hexadecimal characters.

### 2.1 Normalisation

Applied in order:

1. Unicode NFKD decomposition.
2. Remove combining marks (`U+0300`–`U+036F`).
3. Lowercase.
4. Replace every `https?://…` run with the single token `url`.
5. Replace every `@handle` and `#hashtag` with the single token `handle`.
6. Replace every character that is not a Unicode letter, number, or whitespace with a space.
7. Collapse whitespace runs; trim.

Steps 4–5 matter: rotating the destination domain is the cheapest evasion available, and
folding all URLs to one token removes that lever.

### 2.2 Shingles

Split the normalised text on spaces. Emit every window of **3 consecutive words**.
If fewer than 3 words remain, emit the whole string as a single shingle.
If the normalised text is empty, the digest is `0000000000000000`.

### 2.3 SimHash

For a 64-slot signed accumulator `v`, initialised to zero:

For each shingle, compute `h = FNV-1a-64(shingle)`. For each bit position `i` in `0..63`,
add `+1` to `v[i]` if bit `i` of `h` is set, otherwise `-1`.

The digest has bit `i` set iff `v[i] > 0`.

FNV-1a-64 uses offset basis `0xcbf29ce484222325`, prime `0x100000001b3`, over the UTF-8
bytes of the shingle, with wraparound at 64 bits.

### 2.4 Similarity

Two digests describe the same campaign when their **Hamming distance is ≤ 3**.

Implementations MAY expose this threshold as configuration. Raising it increases false
positives, which are the more expensive error in moderation: a missed spam post is an
annoyance, a wrongly quarantined user is an injustice.

---

## 3. Feed format

A server publishes a JSON document over HTTPS. The endpoint location is out of scope;
`/.well-known/abuse-signals` is suggested.

```json
{
  "version": 1,
  "generated": "2026-08-26T04:31:00.000Z",
  "items": [
    { "digest": "500aa4ab110d4309", "servers": 4 },
    { "digest": "a1b2c3d4e5f60718", "servers": 2 }
  ]
}
```

**Fields**

| Field | Type | Meaning |
|---|---|---|
| `version` | integer | Always `1` for this document. Consumers MUST reject unknown versions. |
| `generated` | RFC 3339 string | When the feed was produced. |
| `items[].digest` | 16 hex chars | Content digest per §2. |
| `items[].servers` | integer ≥ 1 | Distinct servers the publisher believes reported this campaign. |

An item MUST NOT carry any other field. A consumer encountering extra fields SHOULD
ignore them and SHOULD log the publisher, since additional fields are the obvious vector
for smuggling content out of a network whose entire purpose is not to carry content.

---

## 4. Consuming a feed

On ingesting a feed from server `S`, a consumer records at most **one** report from `S`
per campaign, regardless of the `servers` count `S` claims. A publisher's claim about
*other* servers is advisory and MUST NOT be treated as independent confirmation —
otherwise one hostile server manufactures a consensus by inventing numbers.

Consumers MUST:

- Rate-limit reports per source server per hour. Reference implementation: 500.
- Expire reports after a retention window. Reference implementation: 7 days.
- Require reports from at least **2 distinct servers** before the signal is non-zero.

---

## 5. Using the signal

The count of independent reporting servers is **one input among several** to a local
decision. It MUST NOT be sufficient on its own to block, delete, or suspend.

This is the central safety property of the design. A federated abuse network where a
remote signal alone can act is a censorship network with extra steps. The reference
implementation enforces it by weighting: the federated signal contributes at most `0.22`
against a quarantine threshold of `0.55`, so remote reports can only ever confirm what
local behavioural signals already suggest.

---

## 6. Privacy analysis

What an observer of the feed learns: that some content with a given digest was
considered abusive by some number of servers.

What they cannot learn: the content (SimHash is lossy and not invertible — 64 bits
cannot reconstruct a message), who wrote it, who received it, or which accounts on the
publishing server were involved.

**Known limitation, stated plainly:** an attacker who *already possesses* a candidate
message can confirm it appears in a feed by computing its digest. Digests confirm
guesses; they do not reveal content. For a system whose feeds carry material already
judged to be mass-distributed spam, this is an acceptable trade — but a deployment
considering publishing digests of *non*-spam content should not assume the digest hides it.

---

## 7. Versioning

Breaking changes increment `version`. Consumers reject documents whose `version` they
do not implement, rather than attempting partial parsing.
