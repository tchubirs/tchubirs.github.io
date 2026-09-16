# Read this before opening the pull request

The patch is sound and the measurements in `README.md` are real. The question of
whether to open a PR against `ScrollPrize/villa` is a separate one, and the answer is
not obviously yes.

## What their CONTRIBUTING.md says

From <https://github.com/ScrollPrize/villa/blob/main/CONTRIBUTING.md>, verbatim:

> - PRs for fixes or improvements must come as a result of you running the tool on real
>   scroll data in persuit of one of the goals of this project.
> - Bugfixes or improvements must be run on real scroll data. Synthetic or toy examples
>   are not accepted
> - Any LLM generated PR must be accompanied by human-written commentary explaining why
>   this PR is relevant or useful
> - We may close PRs which appear to be simple "fishing expeditions" for llms (ie.
>   "claude find bugs in this codebase") unrelated to humans actually using the code in
>   pursuit of our goals.

Two of those we meet, two we do not.

**Met.** The measurements were run on real scroll data: the project's own published
Scroll 5 annotations and a published Scroll 5 autosegmentation, through the project's
own binaries. Nothing in `README.md` is a toy example.

**Not met.** No human was using the tool on scroll data when this was found. It was
found by reading the source. Writing anything else in the PR would be a lie, and a lie
in a submission to the people who would pay for it is worse than no submission.

**Not met yet.** The PR would need human-written commentary. That has to actually be
written by a person — a sentence or two in their own words about why they think a
ranking metric that cannot be re-run matters. It cannot be ghostwritten here; that is
the point of the rule.

## What follows from that

The Progress Prize is a different gate from a PR, and it is the more honest fit. Its
criteria (<https://scrollprize.org/prizes#progress-prizes>) ask for open-source work that
helps read the scrolls, evaluated on real data, well documented. They do not require
that the author was unrolling a scroll when they found the problem. So:

1. **The prize submission is the primary route.** Make the work public under a
   permissive licence, submit the form, disclose the AI authorship. That is all true
   and none of it requires a claim we cannot back.
2. **A PR is optional and comes second.** If it is opened, it should say in its own
   first lines how the defect was found. A PR that is upfront about being AI-produced
   and carries a real measurement is a much better bet than one that pretends to be
   something else and gets read as a fishing expedition.
3. **The checkbox in their PR template** — "I personally verified that the example and
   proof above were produced by this PR on the stated data" — is a statement by the
   person who ticks it. Everything above it can be re-run from `README.md` in about
   fifteen minutes on a machine with the dependencies installed. Tick it after doing
   that, not before.

## What the submission does not claim

It does not claim a wrong ranking was found. On the one real surface reachable from
outside the team, the metric did not move between draws. The claim is narrower: the
draw was tied to the wall clock, that is now fixed at no cost, and the tool to find out
whether it matters on their traces ships with it.

That narrower claim is worth less than the dramatic one. It is also the one that is
true.
