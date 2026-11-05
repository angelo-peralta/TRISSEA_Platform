# Reservation — Acceptance & QA Matrix (ADR-008)

| ID | Scenario | Expected result |
| --- | --- | --- |
| RES-001 | Open authorized terminal and valid PHT date | Shows available passenger pickup windows, booking-party units |
| RES-002 | Last slot raced by 20 passengers | At most `capacity` active reservations; losers get `SLOT_FULL` |
| RES-003 | Same request duplicated from flaky 4G | Same reservation and response by idempotency key |
| RES-004 | Same idempotency key, different body | `IDEMPOTENCY_PAYLOAD_MISMATCH` |
| RES-005 | Hold TTL expires while passenger confirms | One definitive `EXPIRED` or `CONFIRMED` result, never both |
| RES-006 | Passenger requests second live slot | Rejected with `ALREADY_HAS_RESERVATION` unless atomic reschedule |
| RES-007 | Driver attempts reservation endpoint | Forbidden; role mismatch; no driver check-in slot |
| RES-008 | Passenger attempts slot in other tenant | Rejected, no foreign passenger data exposed |
| RES-009 | Wrong/expired terminal QR or replay | Denied, rate-limited, auditable |
| RES-010 | Accessible dispatcher-assisted check-in | Allowed only for authorized staff with explicit verification record |
| RES-011 | GPS spoofed inside terminal | GPS alone insufficient for check-in |
| RES-012 | Invalid party size, unapproved route/vehicle | Hold or quote rejected before dispatch |
| RES-013 | Fare changes after confirmation | Passenger must accept current quote before ride created |
| RES-014 | Reservation confirmed, no check-in after grace | `NO_SHOW`, not driver assigned; recovery policy applied |
| RES-015 | Driver queue A before B; passenger reserved earlier | Eligible driver A gets first offer; reservation time doesn't change driver FIFO |
| RES-016 | No eligible driver, bounded timeout reached | `UNFULFILLED`, no phantom assignment, safe linked-ride reconciliation |
| RES-017 | Driver accepts after offer expires | Late acceptance rejected without double engagement |
| RES-018 | Passenger cancels during dispatch | Outstanding offers/ride/reservation synchronized; no ghost driver assignment |
| RES-019 | Crash between ride insert and reservation update | Transaction rolls back or reconciles to one linked ride |
| RES-020 | Two phones reschedule the same reservation | Only one new slot, old/alternative state consistent |
| RES-021 | Operator closes terminal during active holds | New holds denied, existing confirmations managed through audited policy |
| RES-022 | Reservation fulfilled, linked ride incomplete | Reservation remains fulfilled; ride completes separately |
| RES-023 | Restart worker and replay outbox | No duplicate reservation, linked ride or queue offer |
| RES-024 | Passenger offline after confirming | Cached receipt visible but state not guessed; refresh on reconnect |
| RES-025 | 15-minute pilot slot rendered in PHT | Correct local window and UTC persistence |
| RES-026 | 50 simultaneous check-ins and walk-ins | Passenger fair admission policy respected, driver queue FIFO invariant holds |

**Release gate:** Unit, integration (real PostgreSQL transactions), API contract, Expo Android device, concurrency, permissions, usability/accessibility and authorized TODA pilot acceptance tests are required. Numeric slot/grace/default values must be published/approved before real booking launch.
