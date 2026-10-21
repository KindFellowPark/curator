# Vendored brand assets

`petrol_tokens_v2.css` is a copy of the Petrol design tokens (v2.1.0), a dark-theme token
set from the author's own brand system. The tokens are generated upstream by a separate
tool that is not part of this repository, so the file is copied in rather than built here.

| File | Upstream | Version | SHA-256 of upstream file | Vendored |
|---|---|---|---|---|
| `petrol_tokens_v2.css` | Petrol brand system, `petrol_tokens_v2.css` | Petrol v2.1.0 | `22dad7321b9833e4db04a988ec725ff6d7234e06faa7ac6cb2b04175ffa301df` | 2026-08-16 |

The hash is what makes a drifted copy detectable: if the upstream file's hash no longer
matches the table, upstream has moved, and the copy here should be replaced and the table
updated in the same commit. Do not edit the vendored file by hand.

The token file loads two Google Fonts, Newsreader and Source Sans 3, from
fonts.googleapis.com.
