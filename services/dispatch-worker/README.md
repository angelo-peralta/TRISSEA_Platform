# Dispatch worker — implementation slot

M1 intentionally does not start a consumer or publish dispatch jobs. The workspace
will add this executable package with the Regular ride vertical slice after the
transactional outbox and engagement model are reviewed. Redis is provisioned now;
BullMQ/Socket.IO operational flows are not represented as working services.

Independent Node/NestJS process consuming BullMQ jobs plus transactional PostgreSQL outbox relay. Must be horizontally safe, idempotent and reaper-reconcilable.

Work types: process ride search, reserve driver/queue offer, expire offer, publish notifications, reconcile stale queue state, project driver presence and process payment events. All assignments require PostgreSQL transaction safety, not a queue-side best-effort check.
