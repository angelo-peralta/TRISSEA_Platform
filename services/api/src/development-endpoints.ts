// Trusted process configuration only. Staging endpoints permit verified data
// migration before legacy tmpfs containers are stopped; never caller headers.
type Environment = Readonly<Record<string, string | undefined>>;
function port(env: Environment, key: string, normal: string, staging: string): string {
  const value = env[key] ?? normal;
  if (env.NODE_ENV === 'production' || ![normal, staging].includes(value)) throw new Error('Invalid local infrastructure endpoint');
  return value;
}
export const testDatabasePort = (env: Environment) => port(env, 'M2_TEST_POSTGRES_PORT', '15433', '16433');
export const otpRedisPort = (env: Environment) => port(env, 'DEV_REDIS_PORT', '16380', '17380');
export const localKeycloakPort = (env: Environment) => port(env, 'DEV_KEYCLOAK_PORT', '18080', '18081');
