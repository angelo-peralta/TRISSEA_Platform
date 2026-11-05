# Deployment and Capacity Plan

## Regional hosting
Initially evaluate managed infrastructure in Singapore (subject to regulatory counsel on data transfers, vendor contract, backup locations, observed Philippine network latency and cost). A Philippines-hosted alternative should be benchmarked if hosting/data-residency needs require it. The product is *operated in the Philippines*, not served by local laptops.

## Minimum production topology
- Two or more API instances behind load balancer across availability zones where budget/region supports it.
- Socket.IO gateway replicas with Redis adapter, authenticated subscriptions and reconnect capability.
- Separate deployable dispatcher worker and outbox relay; durable queue with retries and reaper.
- Managed PostgreSQL primary with PITR/backups and PostGIS; connection pooling, read replica only for analytics.
- Managed Redis with recovery plan; object storage for documents; encrypted secrets and certificates.
- Metrics/log tracing, dashboards, alerting, SLO error budget and runbooks.

## Sample development vs production
| Environment | Purpose | Availability promises |
| --- | --- | --- |
| Local Docker | schema/API experiments; simulation | none |
| Staging | end-to-end in synthetic pilot zone; load tests | best effort |
| Pilot production | small licensed real-world area | documented support and incident response |
| Regional scale | multiple tenants/cities | capacity tested, multi-AZ and disaster recovery |

## Performance engineering
Define and benchmark against **provisional** product SLOs in `13-TESTING-SLOs.md`. Record P50/P95/P99 API latency, time-to-offer, DB lock contention, stale locations, socket reconnect latency, worker backlog, routing provider error rate and map data cost.

## Capacity model (planning example only)
If 5,000 online drivers emit a sample every 10 seconds, system ingress is about **500 location messages/second**, excluding passenger tracking/heartbeats. If every sample were stored in PostgreSQL, that would be ~43.2 million records/day; avoid indiscriminate permanent raw position writes. Use Redis ephemeral last position and policy-driven bounded history storage.

## Scaling gates
At measured saturation: cache geospatial candidate grids with appropriate freshness, shorten routing candidate lists, scale API/worker pool, partition telemetry, tune GiST and query plans, monitor connection counts, add analytics data pipeline. No premature move to Kafka, Kubernetes, microservices or sharding.

## Recovery
- Nightly verified backups plus PostgreSQL PITR for production; quarterly restore drills as initial policy proposal.
- Define RPO/RTO with owner and budget before pilot; do not claim reliability from topology alone.
- Safe-degraded mode: no new bookings when transaction DB unavailable; ongoing rides display last confirmed server state with explicit data freshness.
- Triage guides in `19-OPERATIONS-INCIDENTS.md`.
