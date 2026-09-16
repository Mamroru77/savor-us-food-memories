# Map motion timing

Card height was 320ms but opacity was 220ms, causing visibly earlier disappearance. Card height, radius and opacity, compact-strip displacement and opacity, and arrow rotation now all use 320ms. CSS cubic-bezier(1/3,0,2/3,1) approximates the JS stack smoothstep curve. Multi-pin stagger remains intentional; the shared overall end time is 320ms. Quiet still skips transitions.

No viewport tracking changes in this patch. Native gesture latency is not claimed fixed. Ordinary overlays driven through getRegion and setData cannot guarantee frame-synchronous map following. A native-anchored display plus separately validated interaction surface is an architectural alternative, not an already validated implementation.
