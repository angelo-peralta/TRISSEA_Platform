// Supported first-party dotenv keys and safe template values.
module.exports = {
  "fields": {
    "NODE_ENV": [
      "development",
      "Required: development only; process injection wins."
    ],
    "TZ": [
      "UTC",
      "Persisted timestamps use UTC."
    ],
    "TRISSEA_PRODUCTION_ENABLED": [
      "false",
      "Release gate: must remain false throughout M2."
    ],
    "SMS_PROVIDER": [
      "mock",
      "Local/CI only: isolated mock gateway; never real network SMS."
    ],
    "SMS_LIVE_ENABLED": [
      "false",
      "Live SMS gate closed."
    ],
    "RECOVERY_ENABLED": [
      "false",
      "Privileged/account recovery gate closed."
    ],
    "REAL_DOCUMENTS_ENABLED": [
      "false",
      "Real identity-document gate closed."
    ],
    "OPERATIONAL_SERVICES_ENABLED": [
      "false",
      "Booking, dispatch, GPS and driving remain disabled."
    ],
    "M2_AUTH_MODE": [
      "local-synthetic",
      "Only supported local authentication mode."
    ],
    "M2_PASSENGER_AUTH_ENABLED": [
      "false",
      "Runtime flag; named fixture profiles select their own enable flags."
    ],
    "M2_DRIVER_AUTH_ENABLED": [
      "false",
      "Runtime driver authentication flag, never driving eligibility."
    ],
    "M2_ADMIN_AUTH_ENABLED": [
      "false",
      "Runtime admin flag; Keycloak TOTP and PostgreSQL grants still required."
    ],
    "M2_VERIFICATION_ENABLED": [
      "false",
      "Synthetic combined test harness opts in through process injection."
    ],
    "M2_VERIFICATION_DATABASE_URL": [
      "",
      "Combined harness injects a distinct least-privilege role in its one disposable DB."
    ],
    "API_PORT": [
      "4000",
      "Optional runtime port override; named profiles use their own ports."
    ],
    "DATABASE_URL": [
      "",
      "Runtime migration override only; foundation profile maps M1_DATABASE_URL."
    ],
    "REDIS_URL": [
      "",
      "Runtime override only; foundation profile maps M1_REDIS_URL."
    ],
    "MIGRATION_TARGET": [
      "0001_foundation",
      "Default M1 tooling ceiling; isolated M2 harness uses reviewed explicit migrations."
    ],
    "M1_POSTGRES_DB": [
      "trissea_m1_dev",
      "Required for foundation Compose; must match existing database."
    ],
    "M1_POSTGRES_USER": [
      "trissea_m1_dev",
      "Required for foundation Compose; preserve existing role."
    ],
    "M1_POSTGRES_PASSWORD": [
      "",
      "Required retained application-database owner credential, distinct from core bootstrap and Keycloak roles."
    ],
    "M1_POSTGRES_PORT": [
      "15432",
      "Loopback M1 PostgreSQL port, separate from M2."
    ],
    "M1_REDIS_PORT": [
      "16380",
      "Foundation compatibility setting; canonical Redis is shared through isolated key namespaces."
    ],
    "M1_DATABASE_URL": [
      "",
      "Required foundation connection; PostgreSQL loopback and matching M1 port."
    ],
    "M1_REDIS_URL": [
      "redis://127.0.0.1:16380",
      "Foundation Redis connection within the one canonical development stack."
    ],
    "M1_API_PORT": [
      "4000",
      "Foundation API port."
    ],
    "M2_TEST_CONTROL_URL": [
      "",
      "Required secret-bearing URL for isolated /m2_control on port 15433."
    ],
    "M2_TEST_POSTGRES_PASSWORD": [
      "",
      "Required isolated test-cluster credential; never reuse M1 or Keycloak credentials."
    ],
    "M2_TEST_POSTGRES_PORT": [
      "15433",
      "Dedicated disposable PostgreSQL cluster port."
    ],
    "M2_TEST_DISPOSABLE_DATABASE": [
      "true",
      "Test profile maps this to M2_DISPOSABLE_DATABASE, never foundation."
    ],
    "M2_DISPOSABLE_DATABASE": [
      "false",
      "Runtime-only explicit migration opt-in; test profile supplies true."
    ],
    "ADMIN_LOCAL_AUTH_ENABLED": [
      "false",
      "Opt-in local admin fixture; no default TRISSEA staff identity/grants."
    ],
    "ADMIN_API_PORT": [
      "4102",
      "Standalone admin fixture API port."
    ],
    "ADMIN_DATABASE_URL": [
      "",
      "Required for enabled admin fixture: separate non-owner runtime login."
    ],
    "ADMIN_KEYS_FILE": [
      ".cache/m2-keycloak/keys.json",
      "Required generated private admin key file; not an environment file."
    ],
    "ADMIN_SECURITY_MODE": [
      "local-synthetic",
      "Local only; production uses production and remains gated."
    ],
    "ADMIN_ORIGIN": [
      "http://127.0.0.1:5174",
      "Exact local BFF browser origin; callbacks remain allowlisted."
    ],
    "ADMIN_API_PROXY_TARGET": [
      "http://127.0.0.1:4102",
      "Vite server-only proxy, never a public client secret."
    ],
    "KEYCLOAK_ISSUER": [
      "http://127.0.0.1:18080/realms/trissea-local",
      "Exact isolated local realm; start-dev prohibited in production."
    ],
    "KEYCLOAK_CLIENT_ID": [
      "trissea-admin-bff",
      "Confidential BFF client; PKCE/state/nonce and mandatory TOTP."
    ],
    "KEYCLOAK_ASSURANCE_CLIENT_ID": [
      "trissea-assurance-reader",
      "Read-only current-factor assurance service client."
    ],
    "KEYCLOAK_BFF_SECRET": [
      "",
      "Required secret for enabled local Keycloak/BFF."
    ],
    "KEYCLOAK_ASSURANCE_SECRET": [
      "",
      "Required distinct assurance-client secret."
    ],
    "KEYCLOAK_DB_OWNER_PASSWORD": [
      "",
      "Required isolated IdP database-owner secret for local Compose."
    ],
    "KEYCLOAK_DB_PASSWORD": [
      "",
      "Required separate least-privilege IdP runtime secret."
    ],
    "KEYCLOAK_BOOTSTRAP_USER": [
      "",
      "Local-only generated temporary realm provisioning identity; no TRISSEA grant."
    ],
    "KEYCLOAK_BOOTSTRAP_PASSWORD": [
      "",
      "Local-only generated bootstrap secret; never a production default."
    ],
    "EXPO_PUBLIC_M2_AUTH_ENABLED": [
      "false",
      "Only explicit local development builds may enable the identity screen."
    ],
    "EXPO_PUBLIC_M2_API_URL": [
      "",
      "Public loopback emulator API URL, e.g. http://127.0.0.1:4104/v1 with ADB reverse."
    ],
    "PASSENGER_METRO_PORT": [
      "8081",
      "Passenger Metro port; distinct from driver."
    ],
    "DRIVER_METRO_PORT": [
      "8082",
      "Driver Metro port; distinct from passenger."
    ],
    "M2_PASSENGER_DATABASE_URL": [
      "",
      "Runtime-only mobile role URL; named profiles inject their own fixture value."
    ],
    "M2_PASSENGER_KEYS_FILE": [
      "",
      "Runtime-only private key path; named profiles inject their own fixture value."
    ],
    "M2_PASSENGER_REDIS_URL": [
      "",
      "Runtime-only OTP Redis connection."
    ],
    "M2_PASSENGER_REDIS_NAMESPACE": [
      "",
      "Runtime-only OTP coordination namespace."
    ],
    "PASSENGER_JWT_ISSUER": [
      "",
      "Runtime-only strict JWT issuer."
    ],
    "PASSENGER_JWT_AUDIENCE": [
      "trissea-passenger-local",
      "Passenger JWT audience."
    ],
    "DRIVER_JWT_AUDIENCE": [
      "trissea-driver-local",
      "Distinct driver JWT audience."
    ],
    "PHILSMS_API_TOKEN": [
      "",
      "Optional INACTIVE legacy candidate credential; never enables live delivery."
    ],
    "PHILSMS_SENDER_ID": [
      "",
      "Optional INACTIVE candidate sender; external approval remains required."
    ],
    "PASSENGER_LOCAL_AUTH_ENABLED": [
      "false",
      "Explicit local persona authentication opt-in."
    ],
    "PASSENGER_LOCAL_API_PORT": [
      "4100",
      "Standalone slice fixture API port."
    ],
    "PASSENGER_LOCAL_DATABASE_URL": [
      "",
      "Required secret-bearing non-owner role URL for this isolated fixture."
    ],
    "PASSENGER_LOCAL_KEYS_FILE": [
      "",
      "Required persona-specific private signing/encryption key file."
    ],
    "PASSENGER_LOCAL_REDIS_URL": [
      "redis://127.0.0.1:16380",
      "Isolated M2 OTP Redis; never M1 Redis."
    ],
    "PASSENGER_LOCAL_REDIS_NAMESPACE": [
      "passenger-local",
      "Persona-specific OTP namespace."
    ],
    "PASSENGER_LOCAL_JWT_ISSUER": [
      "http://127.0.0.1:4100/v1",
      "Exact persona fixture JWT issuer."
    ],
    "PASSENGER_LOCAL_JWT_AUDIENCE": [
      "trissea-passenger-local",
      "Mobile runtime passenger audience."
    ],
    "PASSENGER_LOCAL_DRIVER_JWT_AUDIENCE": [
      "trissea-driver-local",
      "Distinct driver audience."
    ],
    "DRIVER_LOCAL_AUTH_ENABLED": [
      "false",
      "Explicit local persona authentication opt-in."
    ],
    "DRIVER_LOCAL_API_PORT": [
      "4101",
      "Standalone slice fixture API port."
    ],
    "DRIVER_LOCAL_DATABASE_URL": [
      "",
      "Required secret-bearing non-owner role URL for this isolated fixture."
    ],
    "DRIVER_LOCAL_KEYS_FILE": [
      "",
      "Required persona-specific private signing/encryption key file."
    ],
    "DRIVER_LOCAL_REDIS_URL": [
      "redis://127.0.0.1:16380",
      "Isolated M2 OTP Redis; never M1 Redis."
    ],
    "DRIVER_LOCAL_REDIS_NAMESPACE": [
      "driver-local",
      "Persona-specific OTP namespace."
    ],
    "DRIVER_LOCAL_JWT_ISSUER": [
      "http://127.0.0.1:4101/v1",
      "Exact persona fixture JWT issuer."
    ],
    "DRIVER_LOCAL_JWT_AUDIENCE": [
      "trissea-passenger-local",
      "Mobile runtime passenger audience."
    ],
    "DRIVER_LOCAL_DRIVER_JWT_AUDIENCE": [
      "trissea-driver-local",
      "Distinct driver audience."
    ],
    "OTP_DIGITS": [
      "6",
      "Development policy default; integer 6..6. Production policy review still required."
    ],
    "OTP_TTL_SECONDS": [
      "300",
      "Development policy default; integer 60..300. Production policy review still required."
    ],
    "OTP_MAX_ATTEMPTS": [
      "5",
      "Development policy default; integer 1..5. Production policy review still required."
    ],
    "OTP_RESEND_SECONDS": [
      "60",
      "Development policy default; integer 60..3600. Production policy review still required."
    ],
    "OTP_HOURLY_LIMIT": [
      "5",
      "Development policy default; integer 1..5. Production policy review still required."
    ],
    "OTP_DAILY_LIMIT": [
      "10",
      "Development policy default; integer 1..10. Production policy review still required."
    ],
    "MOBILE_JWT_SECONDS": [
      "600",
      "Development policy default; integer 60..600. Production policy review still required."
    ],
    "ADMIN_IDLE_SECONDS": [
      "900",
      "Development policy default; integer 60..900. Production policy review still required."
    ],
    "ADMIN_REAUTH_SECONDS": [
      "300",
      "Development policy default; integer 30..300. Production policy review still required."
    ],
    "OTP_IP_HOURLY_LIMIT": [
      "20",
      "Development policy default; integer 1..20. Production policy review still required."
    ],
    "OTP_DEVICE_HOURLY_LIMIT": [
      "10",
      "Development policy default; integer 1..10. Production policy review still required."
    ],
    "OTP_DEVICE_DAILY_LIMIT": [
      "20",
      "Development policy default; integer 1..20. Production policy review still required."
    ],
    "OTP_GLOBAL_DAILY_LIMIT": [
      "100",
      "Development policy default; integer 1..100. Production policy review still required."
    ],
    "MOBILE_SESSION_SECONDS": [
      "86400",
      "Development policy default; integer 600..86400. Production policy review still required."
    ],
    "AUTH_RETRY_SECONDS": [
      "15",
      "Development policy default; integer 1..30. Production policy review still required."
    ],
    "DEV_RESTORE_MODE": [
      "false",
      "Migration-only process injection for verified restoration into NEW volumes; ordinary dev:infra:up rejects true. Never persist true."
    ],
    "DEV_POSTGRES_ADMIN_USER": [
      "trissea_dev_bootstrap",
      "Required canonical core-cluster bootstrap role, never an application or test login."
    ],
    "DEV_POSTGRES_ADMIN_PASSWORD": [
      "",
      "Required generated local-only core bootstrap credential; separate from all retained database roles."
    ],
    "DEV_REDIS_PORT": [
      "16380",
      "Canonical Redis loopback port; namespaced development/test keys."
    ],
    "DEV_KEYCLOAK_PORT": [
      "18080",
      "Stable local Keycloak issuer port; do not change without identity migration review."
    ],
    "DEV_KEYCLOAK_HEALTH_PORT": [
      "19000",
      "Loopback Keycloak management health endpoint."
    ],
    "DEV_REDIS_URL": [
      "redis://127.0.0.1:16380",
      "Canonical namespaced development/test Redis endpoint; staging uses explicit process injection only."
    ]
  },
  "bounds": {
    "OTP_DIGITS": [
      6,
      6,
      6
    ],
    "OTP_TTL_SECONDS": [
      300,
      60,
      300
    ],
    "OTP_MAX_ATTEMPTS": [
      5,
      1,
      5
    ],
    "OTP_RESEND_SECONDS": [
      60,
      60,
      3600
    ],
    "OTP_HOURLY_LIMIT": [
      5,
      1,
      5
    ],
    "OTP_DAILY_LIMIT": [
      10,
      1,
      10
    ],
    "MOBILE_JWT_SECONDS": [
      600,
      60,
      600
    ],
    "ADMIN_IDLE_SECONDS": [
      900,
      60,
      900
    ],
    "ADMIN_REAUTH_SECONDS": [
      300,
      30,
      300
    ],
    "OTP_IP_HOURLY_LIMIT": [
      20,
      1,
      20
    ],
    "OTP_DEVICE_HOURLY_LIMIT": [
      10,
      1,
      10
    ],
    "OTP_DEVICE_DAILY_LIMIT": [
      20,
      1,
      20
    ],
    "OTP_GLOBAL_DAILY_LIMIT": [
      100,
      1,
      100
    ],
    "MOBILE_SESSION_SECONDS": [
      86400,
      600,
      86400
    ],
    "AUTH_RETRY_SECONDS": [
      15,
      1,
      30
    ]
  }
};
