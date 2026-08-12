# Security

## Reporting a vulnerability

Report security issues privately through
[GitHub Security Advisories](https://github.com/dallascrilley/placard/security/advisories/new).
Please do not open a public issue for a vulnerability.

Include the affected version, reproduction steps, and the impact you observed.
I aim to acknowledge reports within 7 days.

## What Placard handles

Placard holds Meta Marketing API access tokens on your behalf, so the security
surface is mostly about those tokens.

- **Token storage.** Tokens are written to a local SQLite database at
  `SQLITE_DB_PATH` (default `./data/tokens.db`). The file is not encrypted.
  Anyone who can read that file can act on the ad accounts the token covers.
  Keep it on an encrypted volume with restrictive file permissions.
- **App secret.** `META_APP_SECRET` is read from the environment and is used to
  exchange short-lived tokens for long-lived ones. It is never written to the
  database or logged.
- **Transports.** The stdio transport (`pnpm start`) is the intended
  deployment: the server runs as a local subprocess of your MCP client. The
  HTTP/SSE transport (`pnpm start:http`) has **no authentication layer**. Do
  not expose it on a public interface. If you need remote access, put it behind
  your own authenticated proxy.
- **Write access.** Placard can create, update, and delete campaigns, ad sets,
  and ads, and it can spend money. Grant it a token scoped to the ad accounts
  you actually want an agent touching.

## Rotating a token

Run the `meta_logout` tool to revoke and delete a stored token, or delete the
SQLite database file. Revoke the app's access from
[Meta Business Settings](https://business.facebook.com/settings) if you believe
a token leaked.

## Supported versions

Placard is pre-1.0. Fixes land on `main` and are released from there; older
tags are not patched.
