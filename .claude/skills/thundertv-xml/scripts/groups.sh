#!/bin/sh
# List distinct <channel group="..."> values with a count of channels in each,
# sorted by count descending. Works against <channels> (raw guide) entries.
#
# Usage:
#   groups.sh FILE.xml              # all groups
#   groups.sh FILE.xml "┃NL┃"       # groups whose value starts with a prefix
#
# Pitfall: always match group prefixes with starts-with(), never contains() —
# "┃NL┃" as a substring also matches "┃FI┃ FINLAND", "┃PL┃ POLAND", etc.
# because the two-letter tag is bracketed by the ┃ box-drawing character, not
# a word boundary grep/xpath understands.

set -eu

file="${1:?usage: groups.sh FILE.xml [prefix]}"
prefix="${2:-}"

if [ -n "$prefix" ]; then
  xpath="//channel[starts-with(@group,\"$prefix\")]/@group"
else
  xpath="//channel/@group"
fi

xmllint --xpath "$xpath" "$file" 2>/dev/null \
  | grep -oE 'group="[^"]*"' \
  | sed -E 's/^group="//; s/"$//' \
  | sort \
  | uniq -c \
  | sort -rn
