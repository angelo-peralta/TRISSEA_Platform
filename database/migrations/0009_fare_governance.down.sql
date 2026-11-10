-- Disposable database rollback only. Fare histories must be exported/preserved before any real deployment rollback.
DROP SCHEMA fare CASCADE;
