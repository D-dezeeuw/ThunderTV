---
name: thundertv-xml
description: Work with ThunderTV configuration export XML files (thundertv-config-*.xml) — settings/sources/live-filter/channels blocks, IPTV channel lists that can run 20k+ entries. Use when reading, filtering, categorizing, deduplicating, or auditing a ThunderTV config export, including the demo file at .claude/context/thundertv-config-demo.xml. Triggers on "channel list", "filter channels", "group", "parsedKey", "xtream", "live-filter", "resulting-channels", or a thundertv-config XML path.
---

# ThunderTV config XML

Exports are large (demo file: 20k+ `<channel>` elements, 5MB+) single-document
XML dumps of app state. Treat them as data to query, not to read end-to-end.

## Document shape

```
<thundertv-export version generatedAt appVersion>
  <environment .../>                     one element, app/platform info
  <settings>                              key/value pairs; values are often
    <setting key value />                 JSON strings (double-escaped, see below)
  </settings>
  <sources count active>
    <source id name type url channelCount groupCount ... />   one per playlist source
  </sources>
  <live-filter>                           the app's OWN dedup/filter pass
    <stats inputRows channels hiddenByCountry hiddenAsJunk
           hiddenAsUnknown collapsed strictFellBack droppedSamples="[...]" />
    <resulting-channels count>            deduped, one row per LOGICAL channel
      <channel name key known rank variants />
    </resulting-channels>
  </live-filter>
  <channels total exported truncated>     the RAW guide list, one row per
    <channel raw group radio parsedBase    physical stream/variant
             parsedKey quality? isRecording url />
  </channels>
</thundertv-export>
```

Two `<channel>` element shapes share a tag name but are unrelated schemas —
always check which parent you're under:

- **`live-filter/resulting-channels/channel`**: `name`, `key`, `known`,
  `rank`, `variants` (count of raw entries collapsed into this one). This is
  the app's already-deduplicated view. Check here first if you just need
  final counts/names — don't re-derive dedup logic by hand.
- **`channels/channel`**: `raw` (original playlist name), `group`, `radio`,
  `parsedBase`, `parsedKey`, `quality` (**optional** — omitted, not empty, on
  roughly half of entries), `isRecording`, `url`. This is the raw per-stream
  list everything else is derived from.

`<channels total="N" exported="M" truncated="true|false">`: exports can be
truncated to a cap. Check `truncated` and compare `exported` to `total`
before assuming you have every row — `count(//channel[@raw])` may be less
than the source's real `channelCount`.

## Credentials — always check before sharing/committing

Exports are supposed to redact URL userinfo, query-string user/pass/token
params, and Xtream `/live/<user>/<pass>/` path segments to `REDACTED`. This
redaction has been observed to **miss JSON blobs stored inside `<setting>`
values** (e.g. `player.active`, `player.zapHistory` — they embed a live
`streamUrl` with real credentials, escaped as `&quot;`). Before treating a
file as safe to share:

```sh
grep -oE 'streamUrl[^,}]*|url="[^"]*"' FILE.xml | grep -viE 'REDACTED|picon://|^url="http://[^/]+/"$'
```

Anything left after that filter (not just a bare host, not already
`REDACTED`) is a real leak — redact it the same way the rest of the file
does, e.g.:

```sh
sed -i '' 's#/live/USER/PASS/#/live/REDACTED/REDACTED/#g' FILE.xml
```

## Querying — use xmllint --xpath, not grep, for anything attribute-shaped

`xmllint` (libxml2) ships on macOS and handles multi-MB files in well under a
second — no need to load the whole file into an editor or a DOM library.

```sh
# Count matches
xmllint --xpath 'count(//channel[@raw])' FILE.xml

# Extract one attribute across matches
xmllint --xpath '//channel[starts-with(@group,"┃NL┃")]/@raw' FILE.xml

# Full matching elements (see "one line per channel" note below)
xmllint --xpath '//channel[@radio="true"]' FILE.xml
```

`--xpath` prints matched nodes **concatenated with no separator** — pipe
through `sed -E 's/\/>\s*<channel/\/>\n<channel/g'` (as the scripts below do)
to get one channel per line for further grepping/counting.

### Pitfall: `contains()` on `group` over-matches — use `starts-with()`

Country/category tags are bracketed by the `┃` box-drawing character, e.g.
`┃NL┃ NEDERLAND HD`. `contains(@group,"NL")` also matches `┃FI┃ FINLAND`,
`┃PL┃ POLAND`, and anything else with "NL" anywhere in the group string.
Always anchor with `starts-with(@group,"┃NL┃")` (include the ┃ characters on
both sides of the tag) when filtering by country/category.

```sh
# wrong: 1608 matches, includes FINLAND etc.
xmllint --xpath 'count(//channel[contains(@group,"NL")])' FILE.xml
# right: 1551 matches, only ┃NL┃-tagged groups
xmllint --xpath 'count(//channel[starts-with(@group,"┃NL┃")])' FILE.xml
```

### Pitfall: `isRecording` is per-channel, not implied by group name

A group named like `┃NL┃ ... TERUGKIJKEN ⏺` (catch-up/replay) can still
contain individual channels with `isRecording="false"` — the live "now
showing" channel sits in the same group as its `REPLAY`-suffixed recordings.
Filter on the `isRecording` attribute itself; don't infer it from the group
or `raw` name text (e.g. don't grep for "REPLAY" as a proxy).

### Pitfall: `parsedKey` collisions are normal, not a bug

Many raw entries legitimately share one normalized `parsedKey` (generic keys
like `AR`, `GR` collapse 20-130+ variants). A high collision count on its own
just means the source playlist has many duplicate/regional feeds for that
key — cross-reference with `live-filter/resulting-channels/@variants` for
the app's own take on how many variants a logical channel has, rather than
treating raw-layer collisions as something to "fix."

### Pitfall: XML special characters inside JSON-in-attribute values

`<setting value="...">` often holds a JSON string, double-encoded: JSON's own
`"` becomes `&quot;` so it can sit inside an XML attribute. Don't
regex-parse these by hand for anything nontrivial — extract the attribute
with xmllint, then unescape (`&quot;` → `"`, `&amp;` → `&`) before treating it
as JSON.

## Utility scripts

All are plain POSIX sh wrapping `xmllint`, no dependencies beyond libxml2.
Run with `--help`-style usage by invoking with no args.

- **`scripts/groups.sh FILE.xml [prefix]`** — distinct `group` values with
  channel counts, sorted descending. Pass a prefix (e.g. `┃NL┃`) to scope to
  one country/category tag first.
- **`scripts/filter-channels.sh FILE.xml [--group-prefix P] [--name-contains
  S] [--radio] [--exclude-recordings]`** — filter the raw `channels/channel`
  list by any combination of predicates, one matching channel per output
  line.
- **`scripts/duplicate-keys.sh FILE.xml [prefix]`** — `parsedKey` collision
  counts (≥2), optionally scoped to a group prefix; use to spot junk/repeated
  entries (e.g. a placeholder channel appearing many times) or to find which
  raw rows to compare before picking one variant to keep.

Example: live, non-replay Dutch sport channels, sorted by group:

```sh
.claude/skills/thundertv-xml/scripts/filter-channels.sh FILE.xml \
  --group-prefix "┃NL┃" --name-contains "SPORT" --exclude-recordings
```

## Demo file

`.claude/context/thundertv-config-demo.xml` (see `.claude/AGENTS.md`) is a
real anonymized export: 20,131 raw channels, 605 groups, 43 country/region
tags, truncated at 20,000 of 26,232 total source rows. Good for testing
filters at realistic scale before pointing scripts at a user-supplied
export. Its `live-filter/resulting-channels` block happens to show
`known="false"` / `rank="100000"` on every row in this sample — that reflects
this particular filter run (nothing in it matched the app's known-channel
list), not a guarantee about the schema in general; don't assume `known` is
always false elsewhere.
