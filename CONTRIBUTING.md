# Contributing

Thanks for taking a look. Bug reports and focused pull requests are both
welcome.

## Setup

Placard targets Node 22 and newer. Development is pinned to the version in
`.nvmrc` (Node 24). `better-sqlite3` compiles a native addon at install time,
so you need a working C++ toolchain (Xcode Command Line Tools on macOS,
`build-essential` and `python3` on Debian/Ubuntu).

```bash
git clone https://github.com/dallascrilley/placard.git
cd placard
pnpm install
pnpm validate
```

`pnpm validate` runs the same four gates CI runs: `typecheck`, `lint`, `test`,
`build`. Get it green before opening a pull request.

## Individual commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Biome check over `src/` |
| `pnpm lint:fix` | Biome check with autofix |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm validate:descriptions` | Assert every tool description is substantial |

## Tests never touch the Meta API

Every test in `src/__tests__/` runs against the fetch mock in
`src/__tests__/utils/mock-fetch.ts`. No test may make a real network call, and
no test may require credentials. If you are adding a tool, add a test that
asserts the request body Placard builds, not the response Meta returns.

## Adding a tool

1. Register it in the matching `src/tools/*.ts` file with `server.tool()`.
2. Write a description an agent can act on without reading the source: what it
   does, every argument, the shape of the return value, the errors it raises,
   and at least one worked example. `pnpm validate:descriptions` enforces a
   200-character floor, which is a floor and not a target.
3. Set the correct annotations from `src/constants/annotations.ts`. Read-only
   tools must not be annotated as destructive, and destructive tools must not
   be annotated as read-only. Agents route on this.
4. Reuse the shared Zod fragments in `src/schemas/` rather than redeclaring
   argument shapes.
5. Add tests covering the happy path and at least one validation failure.

## Pull requests

Keep changes scoped to one concern. Use
[Conventional Commits](https://www.conventionalcommits.org/) for commit
subjects (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Describe what you
verified and how.

Do not include real Meta app IDs, business IDs, pixel IDs, account IDs, or
access tokens in code, tests, docs, or commit messages. Use obviously-fake
placeholders.

## License

Contributions are licensed under the MIT License in `LICENSE`.
