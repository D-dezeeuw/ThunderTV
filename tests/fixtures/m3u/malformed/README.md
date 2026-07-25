# Malformed M3U corpus (Feature 06.7.1/06.7.10)

Real-world IPTV playlists are hand-edited, provider-generated files as often
as not; this corpus exercises the shapes that have actually been observed to
break naive parsers, so the engine's "never throw, always report" contract
(Feature 06.7.2) has concrete regression coverage instead of a hope.

| Fixture                        | Observed shape                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-header.m3u`           | No `#EXTM3U` line at all — a common result of concatenating raw `#EXTINF` blocks without their header, or a provider export bug.                        |
| `unbalanced-quotes.m3u`        | An `#EXTINF` attribute with an unterminated quote — a common hand-edit mistake.                                                                         |
| `extinf-without-url.m3u`       | A non-trailing `#EXTINF` line with no following stream URL (e.g. two `#EXTINF` lines in a row before the file continues) — a truncated provider export. |
| `trailing-extinf-no-url.m3u`   | The _last_ entry in a file cut off before its stream URL — a genuinely truncated download.                                                              |
| `duplicate-extinf.m3u`         | Two consecutive `#EXTINF` lines for the same entry with no URL between them — seen in playlists concatenated by naive tooling.                          |
| `binary-garbage.m3u`           | Raw non-UTF-8 bytes spliced into an otherwise-valid file — corruption from a bad transfer or a provider serving the wrong content-type.                 |
| `truncated-mid-line.m3u`       | The file ends mid-URL, no trailing newline — an interrupted download.                                                                                   |
| `bom.m3u`                      | A leading UTF-8 BOM before `#EXTM3U` — common from playlists authored/re-saved on Windows.                                                              |
| `crlf-and-cr-line-endings.m3u` | A mix of CRLF and lone-CR ("classic Mac") line endings in the same file — playlists round-tripped through old tooling.                                  |

`sample.m3u` (one level up) is a small, well-formed fixture ported from
thunder-tv's `apps/web-e2e/src/fixtures/test.m3u` (Feature 06.2.7) — a
regression baseline distinct from this corpus.
