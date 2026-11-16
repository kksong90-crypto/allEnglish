# Student practice and public learning catalog — 2026-11-16 KST

Completes the existing PR57 practice implementation without replacing the legacy official exam or points paths. Published assigned plans launch cards, recall, spelling or mock practice directly from the learning schedule. The server resolves exact Station scope IDs from the plan, not browser-supplied ranges. Personal practice makes no official result or point writes. Each load is a random sample up to200 words, explicitly labelled.

Public learning material panel includes all published GENERAL categories supported by the existing Station catalog, including textbooks, mock exams, vocabulary and supplementary material. Search now covers category, publisher, author, grade, year/month and series as well as title. Exact revision/section IDs and expected word counts are retained; missing non-Day labels no longer invent a Day. Teacher-only, unpublished, internal school-exam and point banks remain excluded per user instruction. This panel displays registered vocabulary/meanings, not textbook PDFs or unregistered question passages.

Verification: portable frontend suite, mixed-category catalog/search/body contract tests, and synthetic Chromium flows at320/390/1365px. Practice checks all four modes, strict spelling feedback, in-progress navigation protection, logout and stale-response guards, and zero official writes. Playwright CI also runs WebKit. No real test-student account is available, so authenticated production UAT and physical mobile device testing are not claimed.

Backend: separate minimum Student API patch bridges published canonical regular/Friday plan source ranges; preserves school overlay priority and all other17 files. Existing URL and rollback60 remain. See the backend rollout record for actual deployment receipt.

Rollback: revert this merge on main for the static app; Student API deployment can independently return to immutable version60. Do not roll back Ops, Station, Recording, sheet data or triggers.
