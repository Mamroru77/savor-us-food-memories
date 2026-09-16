# Lucide icon cleanup and restrained UI transitions

## Icon audit
Scanned miniprogram WXML/JS/WXSS for remaining symbol-based icon candidates. Confirmed replacements:
- Add photo-remove × → existing Lucide X in s-icon, 1.75 stroke.
- Map pending-location close × → Lucide X.
- Native Map pagination ‹ / › → Lucide ChevronLeft / ChevronRight (SVG sources retained; 3x PNG exports for native cover-image).

Existing s-icon is already Lucide-based, so existing vector icons are retained rather than replaced with another family. The validated native stack arrow remains unchanged. Copyright and ISC license are retained under images/icons/lucide. Source URLs are recorded there. No React/Vue/Svelte/Morphicons runtime was installed. This implements SVG-based icons and CSS motion, not arbitrary SVG path morphing.

Remaining symbol matches are individually classified in reports/unicode-icon-audit.json: prose navigation arrows, code comments and share-import parsing patterns. They are not button artwork and are intentionally preserved. User records are not scanned or modified.

## Motion completed
- Map filter and pending popovers stay mounted; opacity + small translation/scale transition both ways, 320ms. Visibility is delayed only on exit and pointer events disable immediately. Active filter icon remains SlidersHorizontal with background feedback (no unapproved switch to X).
- Filter check marks stay mounted; opacity/scale 180ms without shifting row geometry.
- Add tag popover uses the same reversible transition; input focus follows the original boolean.
- Shared Sheet retains its rendered type through 320ms exit even when the parent clears request properties. Existing scroll measurement and all business callbacks remain in place. Reopen cancels stale exit timers.
- FAQ answers use measured text height for 320ms expansion/collapse; no fixed max-height clipping.
- Toast retains payload through 220ms exit; preserves horizontal centering. New toast cancels removal of the previous visual state.
- Existing detail like/save/share icons get small scale state feedback; library tabs, preferences and theme selections get short background/border transitions.
- Quiet disables the added transitions/animations. Component detach cancels presentation timers.

## Preserved scope / not claimed complete
- Map JS, native visual/hit architecture, gesture behavior and 320ms card/stack motion are unchanged.
- Import remains paused; this release does not rework the import accordion, add merchant lookup or alter saving/cloud behavior.
- Photo deletion and file cleanup remain immediate. No stale private-photo preview is retained just to animate removal.
- System dialogs (native image picker, navigation etc.) are controlled by WeChat, not restyled.
- This is not a claim that every conditional block in the app now animates. Destructive confirmation branches, import content and data-driven replacement states require separate review; no blanket `transition: all` was added.

## Checks
198 static checks, 21 TabBar checks, assets, 186 mock scenarios pass. Added tests cover Lucide sources/license, cancel-on-reopen/dispose/Quiet, Sheet content retention, reversible menu structure, FAQ geometry and Toast centering. Updated the obsolete pending-popover wx:if assertion to check mounted transition + aria-hidden instead; cloud/privacy tests remain enabled.

Native WeChat touch, accessibility and visual animation acceptance was not run here. Acceptance focus: screenshot filter menu enter/exit, pending close, native group paging, Sheet fast close/reopen (including Me bottom scrolling), Toast replacement, FAQ long text and Quiet mode. No cloud deployment needed.
