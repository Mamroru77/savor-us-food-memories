# Approved official Lucide Tab state pairs

Supersedes the single-shape production Tab state in TAB_LUCIDE_MORPH_VALIDATION.md. The rejected backing/opacity-only state release remains reverted.

| Tab | Rest | Selected |
| --- | --- | --- |
| Home | House | HouseHeart |
| Map | Map | MapPinned |
| Add | Plus | SquarePlus |
| Us | Users | UsersRound |
| Me | User | UserRound |

All endpoints are official Lucide SVGs, with original geometry intact. No hand-drawn attic/window, added tick, substitute solid shape or selected background was introduced. All strokes remain rounded at 1.75. Existing theme foreground colors remain.

## Production behavior
- All five tabs now use the morph component between approved endpoints.
- At rest and after completion, exact official SVG is displayed via s-icon. Canvas is visible only during the 320ms interpolated motion. Intermediate geometry is sampled by Morphicons; it is not used as the final icon.
- Mid-flight retarget starts from currently drawn geometry. A generation guard rejects stale callbacks. Only start/end visibility uses setData; no per-frame geometry crosses setData.
- Quiet snaps directly to the target SVG. Missing engine or unavailable Canvas reports fallback and preserves a static official SVG.
- TabBar JS still imports no modules or business state. An in-memory, UI-only recent-transition record passes the prior selected index to a newly created TabBar. Native wx.switchTab is issued immediately, not delayed for animation. Failed navigation clears the handoff. State is not written to storage or backend.
- No entry-only pop or new selected background overlays the path animation. The center Add circular button retains its original layout and material; its glyph changes Plus/SquarePlus.
- Map native marker/callout/display/hit architecture and other business behavior are untouched.

## Validation
Run npm run verify:all. Includes:
- SVG source-to-IconNode equality for all ten endpoints.
- Finite/distinct intermediate paths across all lab pairs.
- Canvas mock draw, reverse continuity, Quiet, failure fallback and detach behavior.
- UI-only previous-selection handoff and exact five pair configuration.

The first five pairs on pages/morph-lab/index now match production states. Browser preview: design-references/lucide-morph-preview.html. Node-only benchmark: reports/morph-adaptation-validation.json. These are not evidence of native frame rate.

Native TabBar Canvas layering, continuity across wx.switchTab on real devices and low-end performance have NOT been executed here. Acceptance: visit all five tabs in order and reverse order, rapidly alternate two tabs, enable Quiet, check dark mode, and verify glyphs remain visible if Canvas fails. If animation falls back, glyph states should still change correctly. Native map cover-image morphing is not changed or claimed validated.

No cloud deployment or cache clearing is required.
