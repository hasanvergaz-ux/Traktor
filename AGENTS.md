<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Game architecture

- Game rules (terrain heights, surfaces, tractor physics, three-point hitch, soil mask) live in `src/game/sim/` as plain TypeScript with no React/three imports, so they stay unit-testable (`src/game/sim/*.test.ts`).
- `src/game/sim/world.ts` is the single source of truth for map layout and `heightAt`; scene meshes and physics both read it so visuals and collisions never drift apart.
- One `useFrame` in `Driver` (`src/game/Game.tsx`) advances sim, visuals, particles, camera, day/night, HUD and audio in a fixed order; per-frame state stays out of React.
- The `/` route is `ssr: false` and lazy-imports the game so three.js never runs on the server.
- Game textures, sounds and the tractor GLB live in `public/game-assets/` and are resolved by name through `asset()` in `src/game/assets.ts`.
- Dev-only `window.__game.simulate(seconds, input)` steps the sim deterministically for checks in the slow sandbox renderer.
- `noPropertyAccessFromIndexSignature` is off in tsconfig because three.js geometry attributes and shader uniforms are index-signature maps.
