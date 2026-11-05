# Pilot QA Test Cases (implementation required)

| Code | Scenario | Expected |
|---|---|---|
| F01 | CSV full import | 42 listed area rows + 1 within-poblacion row staged, no active price |
| F02 | Quoted missing origin/direction | 422 `FARE_RULE_NOT_AVAILABLE` |
| F03 | Fare editor attempts approval | 403 maker/checker separation |
| F04 | Reviewer activates unsourced fare | rejected; missing verified legal source |
| F05 | Two fare versions overlap | transaction rejects conflicting activation |
| F06 | Earlier accepted quote after publication | original consented snapshot unchanged |
| F07 | Student fare requested without required verification | discount held until eligibility proven |
| R01 | Prohibited national-highway segment | route rejected/no fallback to car-only route |
| R02 | Legal road restriction map unavailable | fail closed (not priceable) |
| T01 | TODA not verified | drivers not offered rides |
| T02 | Driver outside authorized MTOP zone | no dispatch |
| T03 | Driver restriction while in ride | incident-safe state, no re-offer |
| B01 | Two passengers submit same booking key | one booking and same response |
| B02 | Two drivers accept same offer | one accepted; other receives conflict |
| B03 | One driver has competing exclusive rides | at most one assignment |
| B04 | Driver disconnects | snapshots recover without duplicated status change |
| B05 | Ride completed but cash disputed | ride remains completed, payment state disputed |
| B06 | Ride cancelled before acceptance | no driver assignment, queue job idempotently revoked |
| S01 | Concurrent Shared seats overbook last place | only available capacity sold |
| S02 | Shared rider's co-rider data exposed | denied |
| S03 | Regular ride in progress while shared group offer arrives | offer blocked |
| X01 | Special stop changed after agreement | new quote and consent required |
| P01 | Support agent reads driver KYC without case | denied and audited |
| P02 | TODA dispatcher accesses other TODA ride | denied |
| P03 | Admin logs in without MFA | high-risk actions blocked |
| P04 | Raw GPS in application logs | test fails, event redacted |
| L01 | Android foreground/background GPS and process termination | report actual device behavior, do not claim perpetual tracking |
| L02 | 2G/3G intermittent connection and app restart | visible stale-state banner, accurate recovered ride |
