#!/bin/sh
# Filter <channel> elements out of the <channels> block by group prefix and/or
# raw-name substring, and print them as plain attribute lines (one per
# channel) rather than raw XML — easier to skim, grep further, or count.
#
# Usage:
#   filter-channels.sh FILE.xml --group-prefix "┃NL┃"
#   filter-channels.sh FILE.xml --name-contains "SPORT"
#   filter-channels.sh FILE.xml --group-prefix "┃NL┃" --name-contains "HD"
#   filter-channels.sh FILE.xml --radio                # radio="true" only
#   filter-channels.sh FILE.xml --group-prefix "┃NL┃" --exclude-recordings
#
# Pitfalls this encodes:
#   - group prefix matching MUST use starts-with(), not contains(): the
#     substring "NL" also occurs inside "┃FI┃ FINLAND", "┃PL┃ POLAND", etc.,
#     so contains(@group,"NL") over-matches. starts-with(@group,"┃NL┃")
#     anchors on the bracketed country tag and avoids the false positives.
#   - isRecording="true" flags an individual REPLAY/catch-up entry; it is NOT
#     implied by the channel's group (a "TERUGKIJKEN"/replay-named group can
#     still hold isRecording="false" channels). Filter on the attribute
#     itself, never infer it from group or raw name text.
#   - quality="" is OMITTED (not empty-string) on ~54% of channels in the
#     demo file — do not assume every channel has a quality attribute.

set -eu

file="${1:?usage: filter-channels.sh FILE.xml [--group-prefix P] [--name-contains S] [--radio] [--exclude-recordings]}"
shift

group_prefix=""
name_contains=""
radio_only=""
exclude_recordings=""

while [ $# -gt 0 ]; do
  case "$1" in
    --group-prefix) group_prefix="$2"; shift 2 ;;
    --name-contains) name_contains="$2"; shift 2 ;;
    --radio) radio_only="1"; shift ;;
    --exclude-recordings) exclude_recordings="1"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

predicates=""
add_pred() {
  if [ -n "$predicates" ]; then
    predicates="$predicates and $1"
  else
    predicates="$1"
  fi
}

[ -n "$group_prefix" ] && add_pred "starts-with(@group,\"$group_prefix\")"
[ -n "$name_contains" ] && add_pred "contains(@raw,\"$name_contains\")"
[ -n "$radio_only" ] && add_pred '@radio="true"'
[ -n "$exclude_recordings" ] && add_pred 'not(@isRecording="true")'

if [ -n "$predicates" ]; then
  xpath="//channel[$predicates]"
else
  xpath="//channel"
fi

# xmllint --xpath concatenates matched nodes with no separator; re-split on
# "/><" boundaries so each channel prints on its own line.
xmllint --xpath "$xpath" "$file" 2>/dev/null \
  | sed -E 's/\/>\s*<channel/\/>\n<channel/g'
