#!/bin/sh
# Find parsedKey collisions in the raw <channels> guide list — i.e. channels
# the app's own normalization would treat as the same logical channel
# (variants/duplicates), sorted by collision count descending.
#
# Usage:
#   duplicate-keys.sh FILE.xml            # all collisions, count >= 2
#   duplicate-keys.sh FILE.xml "┃NL┃"     # restrict to a group prefix first
#
# Context: <live-filter><resulting-channels> already stores the app's own
# post-dedup view, one row per logical channel with a variants="N" count —
# check that block first if you just need the final numbers. Use this script
# when you need to see WHICH raw <channels> entries collapsed into a given
# key (e.g. to compare their quality/url before picking one to keep).
#
# Pitfall: parsedKey collisions are common and expected (100+ raw entries can
# share a generic key like "AR" or "GR") — a high count is not itself a bug,
# it just means many source variants map to one logical channel.

set -eu

file="${1:?usage: duplicate-keys.sh FILE.xml [group-prefix]}"
prefix="${2:-}"

if [ -n "$prefix" ]; then
  xpath="//channel[starts-with(@group,\"$prefix\")]/@parsedKey"
else
  xpath="//channel/@parsedKey"
fi

xmllint --xpath "$xpath" "$file" 2>/dev/null \
  | grep -oE 'parsedKey="[^"]*"' \
  | sed -E 's/^parsedKey="//; s/"$//' \
  | sort \
  | uniq -c \
  | sort -rn \
  | awk '$1 >= 2'
