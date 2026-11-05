-- Example query templates: $1 longitude, $2 latitude, $3 radius meters, $4 tenant uuid.
-- Use with parameterized API SQL and a recent-position freshness threshold.
-- Do not execute directly in psql without binding values.

-- On-demand candidates. Road ETA is calculated after a small shortlist is returned.
SELECT p.driver_id,
       ST_Distance(p.position, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
FROM driver_last_positions AS p
JOIN driver_shifts AS s ON s.driver_id = p.driver_id
  AND s.tenant_id = p.tenant_id AND s.status = 'ACTIVE' AND s.mode = 'ON_DEMAND'
JOIN driver_tenant_authorizations AS a ON a.tenant_id = p.tenant_id
  AND a.driver_id = p.driver_id AND a.verification_status = 'VERIFIED'
WHERE p.tenant_id = $4
  AND p.captured_at > now() - interval '30 seconds'
  AND ST_DWithin(p.position, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
  AND NOT EXISTS (
    SELECT 1 FROM rides r WHERE r.driver_id = p.driver_id
    AND r.status IN ('DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS'))
  AND NOT EXISTS (SELECT 1 FROM ride_offers o WHERE o.driver_id = p.driver_id AND o.status='PENDING')
  AND NOT EXISTS (SELECT 1 FROM terminal_queue_entries q WHERE q.driver_id = p.driver_id
    AND q.status IN ('WAITING','RESERVED'))
ORDER BY distance_m ASC
LIMIT 20;

-- Terminal FIFO claim belongs IN A TRANSACTION. $1 tenant UUID, $2 terminal UUID.
-- SELECT one candidate, lock and re-verify all policy eligibility before making offer.
SELECT q.id, q.driver_id FROM terminal_queue_entries q
JOIN driver_shifts s ON s.id = q.shift_id AND s.status='ACTIVE' AND s.mode='TERMINAL'
JOIN driver_tenant_authorizations a ON a.tenant_id=q.tenant_id AND a.driver_id=q.driver_id
WHERE q.tenant_id=$1 AND q.terminal_id=$2 AND q.status='WAITING'
  AND a.verification_status='VERIFIED'
ORDER BY q.enqueued_at ASC, q.id ASC
FOR UPDATE OF q SKIP LOCKED
LIMIT 1;

-- Important: `SKIP LOCKED` can cause concurrent dispatchers to temporarily
-- bypass the earliest locked entry. If fairness requires strictly no bypass,
-- serialize claims with a per-terminal advisory/row lock, then re-check FIFO.
