# Cached Tab morph replay correction

User reported a transition on the first click but none on later visits. The prior implementation relied on child/TabBar component show notifications to seed and restart motion, despite cached pages retaining their selected endpoint. This patch makes the replay path explicit rather than assuming component remount/show order.

- Every tab page invokes TabBar.replayTransition after committing selected/theme/Quiet in onShow.
- Each actual tab switch gets a unique monotonic UI sequence (not a millisecond timestamp as identity). A destination-only replay updates from/key and explicitly activates its morph children after view state commits.
- Reused morph children clear stale hidden state and reseed the approved source once per sequence. Repeated identical property notifications no longer cancel/replan an in-flight animation.
- If native canvas rAF accepts scheduling but delivers no callback for 48ms, that animation switches to bounded 16ms timers; normal rAF remains preferred. The watchdog and timers are cancelled on hide/detach; stale generations remain rejected. This is a defensive fallback, not evidence that stalled rAF was the unique cause on the user's device.
- Official endpoints, five pair choices, 320ms duration, exact static SVG endpoints, Quiet and Canvas-error SVG fallback are unchanged.
- Map callout structure and native gesture logic are untouched; its same-layer warning is not treated as the root cause.

Validation: 226 static checks, 21 TabBar checks, assets and 195 mock scenarios. Added explicit five-page activation checks, Home→Map→Home→Map unique-sequence coverage, repeated cached child replay, duplicate-notification suppression and silent-rAF fallback. Real native repeated Tab navigation is still pending user acceptance.

Acceptance: repeatedly switch Home → Map → Home → Map, then Add → Us → Me and back. Both newly visited and cached tabs should transition. Tapping the already selected tab is still a no-op because its state has not changed. Quiet intentionally skips motion. No cloud deployment or cache clearing needed.
