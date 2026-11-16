# Administrator public catalog and practice preview

The previous restriction incorrectly conflated read access to public learning materials with student-assigned exam authorization. Administrators and teachers now use the same public catalog and exact-section reader as students. The backend allows only public library read actions for validated staff sessions; a server-owned `STAFF_PUBLIC_PREVIEW` gateway subject does not impersonate a student. It cannot call assigned practice or points actions. Internal/teacher/unpublished content remains excluded by the same Station public visibility policy.

In 전체 단어장 → 전체 공개 교재·범위 찾기, choose a book and scope, then click 이 범위 학생 연습 미리보기. It reuses all four in-memory modes with the first200 verified public words and explicit staff-preview labels. No student account, assignment, grade, wrong-note or point write is created. Student assigned-plan access stays unchanged.

Verification: frontend253 portable regressions, public admin catalog/body/preview-button and stale-reset contracts, four-mode staff-preview identity/alias/no-write tests; backend staff public-read allowlist, forbidden assigned/points actions, and unchanged student identity tests. Chromium synthetic mobile and desktop regression passed. Actual staff login and physical-device UAT are not claimed.

Rollout first attempt rolled back to61 because immediate deployment GET still returned the previous version. Editor restore was verified; no business writes. GET readback now polls briefly without retrying mutation. Immutable61 remains the rollback point. Final rollout and Pages receipts are recorded in the PR.
