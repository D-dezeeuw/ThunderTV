# src/shared/

Cross-cutting code that isn't a feature module in its own right — today,
just the test harness.

- `testing/bind-dom.ts` — `mountTemplate(html)`/`mountAfterBoot(html)`: mount
  real markup with real Spektrum bindings in jsdom, at the same
  "user-semantics" level a page author would write (Feature 05.10.1). Both
  reset state/persistence/history first, seed defaults, register every
  action/selector, then mount and bind — `mountAfterBoot` additionally
  rehydrates, for specs proving the restored-session-renders-before-heavy-load
  contract in `src/app/bootstrap.ts`. Returned `dispatch(fnName, value)`
  clicks an existing `[data-fn="fnName"]` element (it does not synthesize
  one) — a spec needing a structured payload calls the exported action
  function directly instead, per `src/state/README.md`'s testing section.

Anything genuinely shared across features but not part of `core`'s
host-adapter layer belongs here — a second file should get its own
paragraph above, not a silent addition.
