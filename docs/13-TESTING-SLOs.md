# Test Strategy, Safety Invariants and Provisional SLOs

## Test layers
1. Unit: fare calculation, location eligibility, queue fairness, policy rules, state machine.
2. Contract: OpenAPI request/response schemas, event versioning, error envelopes.
3. Integration: PostGIS spatial queries, transaction locking, outbox re-delivery, Redis loss recovery.
4. Concurrency: two drivers accept same offer; one driver accepts two offers; cancellation races acceptance; reaper races acceptance; concurrent queue joins.
5. Mobile E2E: background GPS, offline reconnect, notifications, Android OEM power policies, permission denial, degraded network.
6. Security: tenant isolation, IDOR/BOLA, expired tokens, replay, privilege escalation, location spoof/anomaly paths, upload abuse.
7. Load/soak: peak offers, queue contention, live location ingest, gateway fanout, PostgreSQL primary overload and routing provider timeouts.

## Mandatory race tests
- 100 simultaneous driver accept attempts for one ride → at most one successful assignment.
- 100 simultaneous ride creations from one passenger (distinct idempotency keys) → at most one active ride.
- Two terminals attempt to enroll one driver → at most one active queue entry.
- Accept exactly at offer expiration boundary → server transaction decides once; no duplicate assignment.
- Worker crashes after DB commit/before queue publish → outbox relay recovers dispatch.
- Socket disconnected during acceptance → canonical GET reconciles correctly.
- Restricted driver cannot self-unrestrict if active ride exists.

## Provisional pilot SLO targets (not measured performance)
| Metric | Starting target | Evidence |
| --- | --- | --- |
| Core booking API availability | 99.9% monthly pilot target | synthetic monitor + incident ledger |
| Quote API latency | P95 < 800 ms excluding slow routing provider | staged load test |
| Ride create latency | P95 < 500 ms for DB acceptance | tracing |
| Eligible first offer | P95 < 5 s if supply exists and routing healthy | dispatch event timestamps |
| Duplicate active driver assignment | 0 | DB constraint + concurrency test |
| GPS freshness | 95% active drivers last position < 30 s in expected signal conditions | telemetry analysis |
| Service recovery after reconnect | P95 < 10 s to canonical ride state | device field test |

## Test strategy by release
No public pilot before load test, adversarial concurrency, privacy/permit review and real Android device field tests. Every release must contain rollback plan and backward-compatible database/event changes.
