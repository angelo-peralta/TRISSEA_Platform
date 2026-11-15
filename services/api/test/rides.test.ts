import assert from 'node:assert/strict';
import {test} from 'node:test';
import {simulationUrl} from '../src/rides/ride-runtime';

const base={NODE_ENV:'test',M4_SIMULATION_ENABLED:'true',M2_AUTH_MODE:'local-synthetic',M2_PASSENGER_AUTH_ENABLED:'true',M2_DRIVER_AUTH_ENABLED:'true',M4_DATABASE_URL:'postgres://synthetic@127.0.0.1:15433/trissea_m2_test_abcdef123456',M2_PASSENGER_DATABASE_URL:'postgres://synthetic@127.0.0.1:15433/trissea_m2_test_abcdef123456'};
test('simulation requires local disposable identity database and cannot activate in production',()=>{
 assert.equal(simulationUrl(base).pathname,'/trissea_m2_test_abcdef123456');
 for(const overrides of [{NODE_ENV:'production'},{M4_SIMULATION_ENABLED:'false'},{M2_AUTH_MODE:'production'},{M2_DRIVER_AUTH_ENABLED:'false'},{OPERATIONAL_SERVICES_ENABLED:'true'},{SMS_LIVE_ENABLED:'true'},{M4_DATABASE_URL:base.M4_DATABASE_URL.replace('127.0.0.1','remote.invalid')},{M4_DATABASE_URL:base.M4_DATABASE_URL.replace('15433','5432')},{M4_DATABASE_URL:base.M4_DATABASE_URL.replace('trissea_m2_test_abcdef123456','trissea')},{M2_PASSENGER_DATABASE_URL:base.M2_PASSENGER_DATABASE_URL+'0'}])assert.throws(()=>simulationUrl({...base,...overrides}));
});
