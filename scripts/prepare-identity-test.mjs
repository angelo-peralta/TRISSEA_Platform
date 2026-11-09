import { randomBytes } from 'node:crypto';
import configuration from './environment.cjs';
try {
 const env=configuration.loadLocal({optional:true});
 if(env.M2_TEST_CONTROL_URL || env.M2_TEST_POSTGRES_PASSWORD){
  if(!env.M2_TEST_CONTROL_URL || !env.M2_TEST_POSTGRES_PASSWORD)throw new Error();
  configuration.environmentFor('test');
  console.info('Existing canonical isolated-test credentials preserved.');
 }else{
  const password=randomBytes(32).toString('hex');
  configuration.updateLocal({M2_TEST_POSTGRES_PASSWORD:password,M2_TEST_POSTGRES_PORT:'15433',M2_TEST_CONTROL_URL:'postgres://m2_test_owner:'+password+'@127.0.0.1:15433/m2_control',M2_TEST_DISPOSABLE_DATABASE:'true'});
  console.info('Prepared isolated test configuration in .env.local; no credentials printed.');
 }
}catch{console.error('Isolated test configuration rejected; no credential replacement performed.');process.exitCode=1;}
