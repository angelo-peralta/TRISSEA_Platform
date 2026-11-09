// Test evidence only. Never persist a hierarchy or an occupied identity input.
export function canCaptureNativeEvidence(nodes, privateValues = []) {
 return nodes.every(node => {
  const text = node.text || '', description = node['content-desc'] || '';
  if (privateValues.some(value => text.includes(value) || description.includes(value))) return false;
  const normalized = text.replace(/[\s()-]/g, '');
  if (/^\+?\d{8,15}$/.test(normalized) || /^\d{6}$/.test(normalized)) return false;
  const sensitiveInput = node.class === 'android.widget.EditText' &&
   (node.password === 'true' || ['Philippine mobile number', 'Verification code'].some(label => description.includes(label)));
  const publicPlaceholder = description === 'Philippine mobile number' && text === '+639…';
  return !sensitiveInput || !text || publicPlaceholder;
 });
}
