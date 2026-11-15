import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isNativeControlVisible,isNativeAction,nativeScrollAdjustment} from '../scripts/android-ui-visibility.mjs';
const nodes=[{bounds:'[0,0][720,1280]',class:'android.widget.ScrollView'},{bounds:'[0,142][720,1116]',class:'android.widget.ScrollView'}];
test('native actions must fit the app viewport inside the Expo wrapper',()=>{
 assert.equal(isNativeControlVisible(nodes,{bounds:'[82,1020][638,1180]'}),false,'A button behind the tab bar must be scrolled into view');
 assert.equal(isNativeControlVisible(nodes,{bounds:'[82,1040][638,1116]'}),false,'Clipped bounds at the scroll edge are not a stable tap target');
 assert.equal(isNativeControlVisible(nodes,{bounds:'[82,952][638,1063]'}),true);
 assert.equal(isNativeControlVisible(nodes,{bounds:'[82,142][638,144]'}),false,'A clipped heading is not ready');
 assert.equal(isNativeControlVisible(nodes,{bounds:'[0,1117][180,1232]'},false),true,'Navigation uses the whole window');
 assert.equal(isNativeControlVisible(nodes,{bounds:'[0,0][0,0]'}),false);
});
test('route labels inside fare text cannot be selected as native actions',()=>{
 assert.equal(isNativeAction({class:'android.widget.TextView'}),false);
 assert.equal(isNativeAction({class:'android.widget.Button'}),true);
 assert.equal(isNativeAction({class:'android.widget.CheckBox'}),true);
});
test('clipped route controls receive a small directed scroll rather than another broad swipe',()=>{
 assert.equal(nativeScrollAdjustment(nodes,{bounds:'[48,142][672,224]'}),'toward-start','Actual stale-quote route selector bounds');
 assert.equal(nativeScrollAdjustment(nodes,{bounds:'[48,1040][672,1116]'}),'toward-end');
 assert.equal(nativeScrollAdjustment(nodes,{bounds:'[48,500][672,590]'}),null);
 assert.equal(nativeScrollAdjustment(nodes,{bounds:'[48,-90][672,142]'}),'toward-start');
 assert.equal(isNativeControlVisible(nodes,{bounds:'[48,-90][672,142]'}),false);
 assert.equal(nativeScrollAdjustment(nodes,{bounds:'[48,142][672,26]'}),'toward-start','UIAutomator can report inverted offscreen rectangles');
 assert.equal(nativeScrollAdjustment(nodes,{bounds:'[0,0][0,0]'}),null);
});
