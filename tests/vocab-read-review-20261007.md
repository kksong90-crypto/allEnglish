# Vocabulary read loading safety

Scope: existing getVocabData UI only. No server, authentication, response schema, vocabulary content, favorites, exam results or printing changes.

Source-confirmed defects: loadVocabBooks swallowed API/network failures while loadVocabBooksOnce still set its success flag; overlapping navigation created multiple reads; a previous session could apply late data/errors; explicit refresh accumulated change listeners.

Candidate: cache completion only after a successful read; share an in-flight read, including force while pending; invalidate data and errors by existing studentSessionEpoch; clear only the owned promise; replace the two owned onchange properties rather than adding listeners repeatedly. Empty successful catalogs remain successful, and no automatic retry is introduced. Explicit refresh after completion still reads again.

Nine new synthetic tests plus existing login/schedule/admin-read tests:36 PASS. Full inline JavaScript syntax checked. No live authentication, API, writes or browser storage accessed by tests. These are functional/race proofs, not production speed or memory improvement measurements. Runtime verification and CI remain separate gates. Rollback reverts this UI-only change; no data migration is needed. Retest/point loaders and favorites automatic synchronization are not modified and remain separate review candidates.
