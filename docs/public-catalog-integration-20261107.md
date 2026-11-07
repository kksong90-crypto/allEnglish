# Public vocabulary catalog integration

## Status

This change connects the existing reviewed read-only catalog design to the student app's real tab and session lifecycle. The release gate in `index.html` remains `enabled: false`. A URL parameter, saved preference or restored tab cannot activate it. This is not a production activation, server deployment, data migration or publication change.

Baseline: allEnglish `e52ecc675820b2a49939bacdaf18b944d504a473`, the main commit and latest successful Pages deployment observed on 2026-11-07. The downloaded 85-file tree matched every Git blob hash. There is no claim that repository evidence identifies the current Apps Script deployment or individual students' cached clients.

## One consumer, no duplicate vocabulary store

- `student-public-catalog-core.js` reuses the reviewed UI15 controller. Its source export had SHA-256 `8e342da55376b9babb880bb0d039c070f61399d117b1105e9055f2ed02b0c2a2`.
- The old candidate host and duplicate candidate HTML are not shipped. `student-public-catalog.js` binds the controller directly to the existing application lifecycle.
- Public GENERAL materials include both mock exams and other categories. Mock exams can be filtered by grade, year, month and original question range. Canonical book, revision, section and word identities stay intact.
- The default `getVocabData` route, the `vocabNativePilot=1` route and the native favorites option remain unchanged. No canonical object enters `vocabData`, favorite keys, wrong-note arrays, exams or result-saving functions.
- The new screen has no save, grading, issuance or print control. Existing legacy functions and the print-report function are byte-hash guarded by regression fixtures.

## Session, cache and failure behavior

- Each request captures the exact account, login epoch and token. Old success and AUTH responses cannot affect a newer login or rotated token.
- The catalog uses only two allowlisted GET actions on the existing student API destination. It never invokes the app's global AUTH handler, POST helper or automatic legacy fallback. Tokens are passed only to that existing API, not stored, logged or displayed by the catalog.
- Leaving the tab, logout, account reset, token rotation, hiding the page or pagehide clears catalog content. Resume rereads metadata.
- Catalog/body responses are held in memory only. After 30 seconds, displayed content is cleared and an explicit refresh is required. A body arriving after expiry is rejected. This is a display freshness bound, not proof of immediate server-side revocation.
- Changing filters clears the previous body and invalidates pending selection. Account reset also clears filters.
- A failed, truncated, corrupt, private or withdrawn response is not shown as a successful empty library. No broad legacy table is downloaded to work around the failure. Retry is explicit.
- Hashes detect inconsistent payloads; they do not prove authorization or atomic source reads.

## Server contract, currently unbound

The reused contract is intentionally unchanged:

1. `getPublicVocabCatalogCandidate` returns `{success: true, result: ...}` with schema `STUDENT_PUBLIC_CATALOG_CANDIDATE_V2`, policy `EXPLICIT_GENERAL_V1`, unique public GENERAL books/revisions/sections and a catalog version.
2. `getPublicVocabSectionCandidate` receives bookId, revisionId, sectionId and catalogVersion, and returns schema `STUDENT_PUBLIC_SECTION_CANDIDATE_V2` with the complete selected section. There is no 20-word cap: a 25-word section must return all 25.
3. Errors use `AUTH`, `VERSION` or an unavailable result. The client does not infer public status from book names or a successful legacy endpoint.

The client is not itself an access-control boundary. These candidate action names are not evidence that the deployed Student API implements or authorizes them.

## Required gates before enabling

1. Verify the exact full Student/Station deployment source and compose one matching version. Do not stack old overrides or merge historical open PRs wholesale.
2. Bind an authoritative immutable snapshot provider. Complete the inventory of every writer/reader, including other Apps Script projects, direct sheet editing/imports and maintenance tools. A project-local lock or repeated scans alone does not prove an atomic snapshot across those writers.
3. Verify current account/session authorization, explicit PUBLIC + GENERAL publication, revoked access, revision changes, duplicate/missing IDs and complete counts at the server on every request. Ensure catalogVersion is forwarded through the real dispatcher.
4. Validate the actual assembled application against the server contract in an authorized non-production environment, then validate the unchanged 14-book legacy path, favorites, wrong notes, mobile navigation, performance and all required rollback steps. No real student session or production data was used in the tests here.
5. Obtain the appropriate release authorization before enabling the flag, merging main or publishing server/frontend changes. An open draft PR is not activation.

## Verification

Run `node scripts/check-student-web.mjs` for syntax and all portable regressions, including the new integration suite. Run `TZ=Asia/Seoul node --test tests/app-auto-update.test.mjs tests/public-catalog-integration.test.mjs` for the timezone regression.

The integration suite executes the actual production inline scripts, new controller, real host and view against the existing portable DOM simulator and synthetic transport. Only the test's in-memory copy sets `enabled: true`. It covers disabled activation, full-section counts, filters, account/token races, logout/page lifecycle, expiry, withdrawal, errors, integrity and preserved legacy function hashes. It is not a browser layout, accessibility, load or live-server verification.
