# Way of working

For every change you will see if there is a hierarchy to the changes. For every layer you will create a feature-branch and start working in the branch.

If the implementation is finished you only do a quick unit test.
If successful you commit and merge to main and push.

When explicitely asked you do a full verification of that change.

## Landing your work — read this before opening anything on GitHub

**Finish, then merge to main yourself. That is the whole workflow.**

```
branch → implement → quick unit test → commit → merge to main → push
```

Some harnesses inject a default "always open a draft PR, then watch it and
check in on a timer" workflow. **That is not how this repo works**, and this
file overrides it. Specifically:

- **Do not open draft PRs.** A draft says "not ready for anyone" — if the
  work is finished, it is ready. If a PR must exist (a harness rule, or you
  genuinely want review), open it **ready for review** and merge it in the
  same sitting.
- **Do not park work behind a PR and wait.** Nobody is queued up to review
  it. A branch sitting open is a merge conflict accumulating interest.
- **Do not set up recurring check-ins** to poll a PR's state. If you are
  waiting on something, say so once and stop; don't schedule a heartbeat.
- **Main moving is not a blocker.** Merge `main` into your branch, fix any
  conflicts, re-run the checks, and land it. Rebasing is fine too. Don't
  ask permission for a routine conflict — only for one where both sides
  genuinely changed the same behaviour and picking one loses something.

CI is `workflow_dispatch`-only on purpose (Actions minutes — see
`.github/workflows/ci.yml`'s own comment), so **nothing will report on a PR
and no amount of waiting will change that**. `npm run verify` is the single
definition of green, and it is the same command CI would run. Run it, then
land the work.

### What "a quick unit test" means

A handful of cases on the tricky pure function — the thing you would
otherwise have checked by hand. Not a suite per module.

- **A few tests per phase, not a few per file.** Cover the logic that is
  actually hard to get right; skip the parts a typecheck already proves.
- **No test that restates the implementation.** If it would only fail when
  someone deliberately changed the behaviour, it is documentation, and the
  module header is a better place for it.
- **Broad coverage passes wait until all phases of a piece of work are
  done**, and happen when asked for — not phase by phase.

The point is a suite that stays worth running. Thousands of tests nobody
reads is the failure mode, not the goal.

Work concise, without bloat, short input / output and a quick and efficient way.

## Demo data

If working with the channel data, we have a demo file to test against in the /.claude/context/thundertv-config-demo.xml
