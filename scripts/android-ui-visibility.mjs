// UIAutomator reports the Expo wrapper and the narrower application ScrollView.
// A partially clipped control can have bounds under the bottom navigation bar.
export const isNativeAction=node=>['android.widget.Button','android.widget.CheckBox'].includes(node.class);
const bounds=n=>n?.bounds?.match(/-?\d+/g)?.map(Number);
function viewport(nodes,scroll){
 const containers=(scroll?nodes.filter(n=>n.class==='android.widget.ScrollView'):[nodes[0]])
  .map(bounds).filter(v=>v?.length===4&&v[2]>v[0]&&v[3]>v[1]);
 return containers.length?[Math.max(...containers.map(v=>v[0])),Math.max(...containers.map(v=>v[1])),Math.min(...containers.map(v=>v[2])),Math.min(...containers.map(v=>v[3]))]:null;
}
export function isNativeControlVisible(nodes,node,scroll=true){
 const b=bounds(node),v=viewport(nodes,scroll);
 if(!b||b.length!==4||!v)return false;
 return b[2]>b[0]&&b[3]>b[1]&&b[0]>=v[0]&&b[2]<=v[2]&&b[1]>=v[1]+(scroll?6:0)&&b[3]<=v[3]-(scroll?6:0);
}
// A full swipe can skip a target clipped at the edge on a long error screen.
// Move a short distance toward that target before continuing the broad search.
export function nativeScrollAdjustment(nodes,node){
 const b=bounds(node),v=viewport(nodes,true);
 if(!b||b.length!==4||!v||b[2]<=b[0]||b.every(n=>n===0))return null;
 if(b[1]<v[1]+6)return 'toward-start';
 if(b[3]>v[3]-6)return 'toward-end';
 return null;
}
