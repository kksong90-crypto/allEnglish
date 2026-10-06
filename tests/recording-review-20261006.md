# Recording date and shared-cache safety candidate

Status: local candidate; not deployed. No live write, student impersonation, print, queue or credential/config modification was performed.

## Reproduced findings

- A failed date query retained old rows but previously changed the save target date.
- A response for another date was accepted without correlation checking.
- Reads could replace rows while writes were pending; writes could start while another date was loading.
- Deadline exception acknowledgement was absent from the pending-write guard, allowing date switching and duplicate writes.
- Both recording and quick service workers deleted caches owned by other applications on their shared origin during activation.

## Minimal candidate

Commit displayed date only with a successful matching response. Initial blank date still uses the server-selected date. Guard read/write overlap, include exception acknowledgement in the existing per-student Set, and allow a single pending operation's explicit read-back verification. Multiple pending operations do not trigger a full rerender. Existing authentication, request IDs, authoritative summaries and uncertain-write handling remain.

Service-worker cleanup is restricted to each application's own cache prefix. This is browser shell-cache isolation, not Station library-cache modification.

## Evidence and limits

Actual current functions were extracted into VM tests with synthetic data and deferred API responses. The additional race suite reproduced four failures before the guard patch; the cache suite reproduced deletion of another app's cache. Relevant date, race, cache, incremental-save, session relogin, student read-only flight and staff runtime suites now pass 23 tests. These are deterministic local tests, not authenticated production write UAT or latency measurements.

Remaining gates: normal UI rendering and request correlation on a mock endpoint; authenticated read-only verification where an existing authorized recording session is available; current remote diff/CI review; cache/version pin update before deployment; published source verification and rollback record. The displayed legacy v8.0.0 footer is a separate low-risk candidate. No claim of full four-system audit completion.

## UI verification / 2026-10-06

The actual app HTML/JS/CSS were served unchanged by a loopback-only synthetic fixture and operated via Chrome's normal UI. First connection accepted the server's default date. Failure for October 7 and a mismatched response for October 8 both preserved the displayed/selected October 6 date. The subsequent synthetic save request used October 6. During an October 10 read a checkbox action was reverted without a save request. During a synthetic October 10 save, selecting October 6 sent no date read and retained October 10. Fixture request logs confirmed the actions and dates. All identities and credentials were synthetic; no production API was contacted.

The initial fixture omitted the real server's `notice` field and displayed undefined in its notice copy after a save. This was a fixture contract error, not a demonstrated production bug. The fixture was corrected against the captured server return shape. App/meta/footer/cache are now pinned to candidate 8.2.12. Authenticated production read UAT remains unavailable in the inspected browser; no authentication data was copied from another browser.

Rollback for this candidate is a source revert to the pre-change main, with a new recording cache pin to make rollback assets propagate. Do not delete localStorage, change API settings, or modify Station cache. Keep the app-specific service-worker ownership guard on rollback to avoid reintroducing cross-app cache deletion.
