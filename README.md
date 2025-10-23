# Bun Package Manager

This project is configured to use Bun as the package manager.

## Prerequisites
- Install Bun: https://bun.sh
- Bun version 1.1.0 or newer is recommended.

## Install dependencies
```sh
bun install
```

## Build
```sh
bun run build
```

## Notes
- The `package.json` field `packageManager` is set to `bun@^1.1.0` and `engines.bun` is `>=1.1.0`.
- If you previously used another package manager, remove any old lockfiles (e.g., `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) to avoid confusion.
