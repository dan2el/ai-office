# Claude Code Instructions

Use `AGENTS.md` as the canonical project guide for this repository. The summary
below highlights the same operational rules for Claude Code sessions.

## Project Shape

This is a Next.js 13 App Router + Convex app for AI Office. Frontend routes live
in `src/app/`, React and Pixi components live in `src/components/`, backend
simulation and data logic live in `convex/`, and static assets live in
`public/assets/`.

## Commands

- Install: `npm install`
- Full dev server: `npm run dev`
- Frontend only: `npm run dev:frontend`
- Backend only: `npm run dev:backend`
- Build/type check: `npm run build`
- Lint: `npm run lint`

The full app needs Clerk, Convex, OpenAI, and Pinecone secrets. Do not commit
`.env.local`, `.env`, `.env.prod`, or other secret-bearing files.

## Coding Rules

- Keep TypeScript strict and use existing project patterns.
- Do not edit generated files under `convex/_generated/` or `next-env.d.ts`.
- Use Convex generated APIs from `convex/_generated/api`.
- Mark client-only React modules with `'use client'` where required.
- Keep Pixi/browser-only components out of server rendering, using dynamic
  imports when needed.
- Preserve the current pixel-art/Tailwind design language unless the request is
  explicitly visual redesign work.

## Safety

Ask for explicit confirmation before running destructive Convex operations such
as database wipes or Pinecone vector deletion. If verification cannot run because
required external service secrets are unavailable, say which command was blocked
and why.
