# STAGING41 background queue acceptance

2026-11-14 22:54 KST: existing isolated deployment updated to41, UI8.2.27-BACKGROUND-QUEUE. Source d2d0c6f8770de204ead6dd7278bc5a2d03c4f46b. Frontend tests151/151 passed before deployment. Server unchanged from40 (SHA256 2cbdc85d1c7357e78a7ea4a54a580bd179b85786e47e103083118c151ed651a1). Rollback40.

At22:59:42 KST, both QA students showed pending saves when the app tab closed. At23:00:02 KST, before reopening, independent Sheets connector read confirmed both UNKNOWN (versions101/59). On reopen0/2 appeared and both journal entries cleared automatically. Restored both students; independent Sheets read confirms RECEIVED versions102/60.

This proves desktop close/reopen acceptance, not physical phone lock/process exit. Phone retest remains pending. Whole save latency target remains unmet (prior40 samples5.926/9.174seconds). Production API38 and operations303 have not been deployed by this work.

Work environment disconnected after acceptance: API release package metadata remains at40; local27 package preparation was NOT validated or committed. Do not treat API package as41-ready. Next: recover source d2d0c6f8770de204ead6dd7278bc5a2d03c4f46b, update package receipt/version/hashes to41, run server/package44 checks, persist backup, physical-phone acceptance, production service verification, then approved limited-class rollout. No full production readiness claim.
