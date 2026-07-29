# Way of working

For every change you will see if there is a hierarchy to the changes. For every layer you will create a feature-branch and start working in the branch.

If the implementation is finished you only do a quick unit test.
If successful you commit and merge to main and push.

When explicitely asked you do a full verification of that change.

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
