import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canCaptureNativeEvidence} from '../scripts/android-evidence-privacy.mjs';
const input = (label, text, password = 'false') => ({class:'android.widget.EditText','content-desc':label,text,password});
test('empty identity fields and the public phone-format placeholder can be captured', () => {
 assert.ok(canCaptureNativeEvidence([input('Philippine mobile number','+639…'),input('Verification code','','true'),{text:'Code not accepted. Try again.'}]));
});
test('valid, reordered, unprefixed and formatted synthetic phone values are withheld', () => {
 for(const text of ['+639980000703','+963980000703','639980000703','+63 998-000-0703']) assert.equal(canCaptureNativeEvidence([{text}]),false);
});
test('partial or otherwise malformed occupied phone fields are withheld too', () => {
 for(const text of ['+9','+','invalid contact']) assert.equal(canCaptureNativeEvidence([input('Philippine mobile number',text)]),false);
});
test('occupied password/code inputs stay withheld even when masked or using another label', () => {
 for(const field of [input('Verification code','••••••','true'),input('Private input','•••••1','true'),input('Verification code','000123')]) assert.equal(canCaptureNativeEvidence([field]),false);
});
test('six digits and captured private values embedded in text or descriptions are withheld', () => {
 for(const node of [{text:'000123'},{text:'000 123'},{text:'Debug code: 000123'},{'content-desc':'Debug code: 000123'}]) assert.equal(canCaptureNativeEvidence([node],['000123']),false);
});
test('ordinary public labels, disabled actions and clocks remain capturable', () => {
 assert.ok(canCaptureNativeEvidence([{text:'Driver verification'},{text:'Go Online unavailable',enabled:'false'},{text:'06:17'}],['000123']));
});
