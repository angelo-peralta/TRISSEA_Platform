import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ADMIN_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';
if (!/^http:\/\/127\.0\.0\.1:(4000|4102)$/.test(target)) throw new Error('Invalid ADMIN_API_PROXY_TARGET');
// Vite's default proxy error contains the request URL and callback code/state.
const logger = createLogger(), emitError = logger.error.bind(logger);
logger.error = (message, options) => {
  if (/(?:http|ws) proxy/.test(message)) emitError('Local API proxy unavailable. Check the local API.', { timestamp: true });
  else emitError(message, options);
};
export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: { host: '127.0.0.1', port: target.endsWith(':4102') ? 5174 : 5173, strictPort: true, proxy: { '/v1': target } },
});
