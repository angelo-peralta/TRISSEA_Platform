# ADR-010 — Tuguegarao City, Tricycle-only, Passenger OTP Pilot

Date: 2026-11-05. Status: **Accepted as initial engineering baseline with unresolved legal policies**.

## Decision
Use one city tenant with verified TODAs as scoped operational organizations (subject to formal operational approval). Prioritize Regular on-demand direct booking and the foundations for Shared and Special; keep terminal queue and passenger-only Reservation deferred. Cash-first and phone OTP for passengers/drivers; admin MFA. Add city-managed, independently-approved, time-versioned fare matrices and tricycle-restricted routing. Source screenshot data is imported as unverified draft.

## Reasons
Matches user-confirmed locality, vehicle and service preference, reduces initial operational complexity, preserves the previously accepted Reservation definition without implying launch readiness, supports multi-TODA operator permissions and gives the city control over regulated fare changes.

## Consequences
Original v1.4 roadmap order (`Regular → terminal/Reservation → Special → Shared`) is superseded for Tuguegarao's launch planning by `Regular → Special direct → approved Shared corridors → deferred terminal/Reservation`. Engineering may proceed with mock demos, but licensed operation requires separate signed city/TODA rate, routing and permit approvals.
