# R2 native preview source repair — 2026-09-19

## Observed failure (not inferred from tests)

Existing five mapped records were grouped into a real two-page stack at native scale 8.88. Visible paging, including a guarded Windows pointer click from page 1/2 to 2/2, selected the existing child 797e… and opened its Memory. Its saved primary source is a bundled /images asset; its second source is a private cloud file ID. Native preview stayed at 1/2 with a spinner both immediately and after a full 49-second regression run. The Memory itself rendered the bundled photo. A read-only getImageInfo probe returned another relative package path, not a native-viewer temporary path. No record/photo references were rewritten.

Baseline verify:all exited 0 (r2-remain-verify-all.exit). Added verify-memory-preview-sources BEFORE the product change; r2-preview-sources-red.exit is 1 on the raw package/cloud input reaching previewImage. This extends coverage rather than modifying the historical memory-return fixture.

## Narrow repair and boundaries

memoryPreview retains the existing same-owner/lease-verified reading restoration. Only package and cloud source lists take the asynchronous resolution path. Package assets receive generated sandbox viewer copies; private photos reuse cloudRecords.downloadMapPhoto and its existing CloudBase/lease boundary. Already supported native/HTTPS paths retain the existing synchronous path. Ordering/current index and saved image references are preserved. Only newly generated viewer copies are released, including late callbacks after cancellation; original photos, bundled assets and Memory/outbox/draft are not removed or rewritten.

Preparation is not a preview return: identity changes, explicit close, navigation away and superseding previews must prevent a late viewer opening. No permission change, identity bypass, cloud deployment, upload, fabricated record, Map layout/camera change or Tab change. Native visual acceptance of the repaired source path must be recorded separately; passing tests alone is NOT FIXED.

New suite: 10 source/order/failure/cancellation/identity/navigation/cleanup/return cases. Historical memory-return suite: 13 unchanged cases. New suite is integrated into verify:r2 and thus verify:all. Reports under ignored reports/ are evidence only, not test dependencies.

## Exact reviewed source and suite SHA-256

- `miniprogram/utils/memoryPreview.js`: `df0e495155c533d51f6f75793363867d136899105db296c274c5980d80541c3d`
- `miniprogram/utils/nativePreviewSources.js`: `09720a528157a5fb1eda7962e33874d2aceccf8392fc2ce6bc46e317ed9d4667`
- `tools/verify-memory-preview-sources.cjs`: `b1a7dc2406cf3973e33eb0791fe802d0b308abb04071e251f4e053cc78319f62`
