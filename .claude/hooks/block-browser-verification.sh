#!/bin/bash
# PreToolUse guard for the `implementation` subagent (and anything else that
# points at it): AGENTS.md's loop is branch -> quick unit test -> commit ->
# merge -> push, nothing more, unless the user explicitly asks for full
# verification. This blocks the Bash commands that would otherwise pull in
# a browser-driven check (dev server + headless browser/Playwright/
# chromium-cli) so that step can't happen silently even if a future prompt
# edit reintroduces the instinct to "test in a browser".
#
# Exit 2 blocks the tool call and returns stderr to the agent as feedback
# (see Claude Code hooks docs, PreToolUse exit-code-2 behavior).

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
    exit 0
fi

# Dev-server launches and browser drivers. Matched only where a shell would
# actually treat the text as the start of a command (line start, or right
# after &&/;/||/|/`(`), never as a substring anywhere in the command line —
# a git commit message or code edit that merely *mentions* "playwright" in
# prose must not trip this, only an actual invocation of it.
BLOCK_PATTERN='(^|&&|\;|\|\||\||\()[[:space:]]*(npm[[:space:]]+run[[:space:]]+dev([[:space:]]|$)|vite([[:space:]]+preview)?([[:space:]]|$)|(npx[[:space:]]+)?playwright([[:space:]]|$)|chromium-cli([[:space:]]|$))'

if echo "$COMMAND" | grep -iE "$BLOCK_PATTERN" > /dev/null; then
    echo "Blocked: browser/dev-server verification is out of scope for this agent." >&2
    echo "AGENTS.md's loop is: quick unit test -> commit -> merge -> push. Only do a full browser check if the user explicitly asks for full verification." >&2
    exit 2
fi

exit 0
