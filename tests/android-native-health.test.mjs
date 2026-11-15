import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeCrashCount} from '../scripts/android-native-health.mjs';
test('native tombstones and Java fatal records are scoped to the app and current run',()=>{
 const log=['100.100 1 2 F DEBUG : Cmdline: ph.trissea.driver.dev','102.100 1 2 F DEBUG : Cmdline: ph.trissea.driver.dev','103.100 1 2 F AndroidRuntime: Process: ph.trissea.passenger.dev, PID: 3','104.100 1 2 F DEBUG : Cmdline: com.android.launcher3','105.100 1 2 F DEBUG : Cmdline: ph.trissea.driver.dev.other'].join('\n');
 assert.equal(nativeCrashCount(log,'ph.trissea.driver.dev',101000),1);
 assert.equal(nativeCrashCount(log,'ph.trissea.passenger.dev',101000),1);
 assert.equal(nativeCrashCount(log,'ph.trissea.driver.dev',103000),0);
});
