# Repository Guidelines

## Project Overview

This repository is a Next.js 13 App Router + Convex project for AI Office, a
Pixi.js virtual office with AI characters, Clerk authentication, OpenAI-backed
text generation, and Pinecone-backed memory search.

Primary code areas:

- `src/app/`: Next.js routes, layout, global styles, and providers.
- `src/components/`: React and Pixi UI/game components.
- `convex/`: Convex backend functions, schema, simulation engine, agents, and
  generated Convex client types.
- `convex/characterdata/`: character definitions and spritesheet metadata.
- `public/assets/`: static client assets served by Next.js.
- `assets/ui/`: source UI SVG assets.

## Local Setup

Install dependencies with:

```bash
npm install
```

The full app requires external services and secrets:

- Local `.env.local`: `NEXT_PUBLIC_CONVEX_URL`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- Convex dashboard environment variables: `OPENAI_API_KEY`,
  `CLERK_ISSUER_URL`, `PINECONE_API_KEY`, `PINECONE_ENVIRONMENT`,
  `PINECONE_INDEX_NAME`.

Do not commit secrets or generated local environment files.

## Common Commands

- `npm run dev`: initialize Convex, then run frontend and backend in parallel.
- `npm run dev:frontend`: run only the Next.js frontend.
- `npm run dev:backend`: run only Convex development sync.
- `npm run build`: run TypeScript checking and `next build`.
- `npm run lint`: run the configured Next.js lint command.

Convex utility commands from the README:

- `npx convex run init:reset`: reset and seed a world.
- `npx convex run --no-push init:resetFrozen`: reset into a frozen world.
- `npx convex run --no-push engine:freezeAll`: freeze all worlds.
- `npx convex run --no-push engine:unfreeze`: unfreeze the latest world.
- `npx convex run testing:listMessages --no-push --watch`: watch messages.

Destructive Convex commands, especially database or vector deletion commands,
must be treated as explicit-user-approval operations.

## Development Notes

- TypeScript is strict. Keep types specific and prefer existing generated Convex
  types from `convex/_generated`.
- Do not manually edit generated files under `convex/_generated/` or
  `next-env.d.ts`.
- Use `api` imports from `convex/_generated/api` for Convex hooks and calls.
- Keep React client-only code marked with `'use client'` where required.
- The app uses Tailwind CSS plus custom pixel-art assets. Preserve the existing
  visual style unless the task asks for a redesign.
- Pixi and viewport code is browser-only. Use dynamic imports for components
  that cannot run during server rendering.
- Avoid broad refactors in the simulation engine or schema unless they are
  required for the requested change.
- When changing character data or initial world setup, check whether Convex data
  needs to be reset before the change is visible.

## Verification

Prefer the narrowest verification that proves the change:

- For type-level or backend changes, run `npm run build` when environment
  requirements allow it.
- For UI changes, run the app and verify the relevant route in a browser.
- For Convex-only changes, run the relevant `npx convex run ...` command when
  secrets and a deployment are configured.

If a command cannot run because required secrets or services are missing, report
that explicitly with the command that was attempted.
