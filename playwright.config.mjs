import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.mjs', workers: 1,
  use: {baseURL: 'http://127.0.0.1:8791', serviceWorkers: 'block', viewport: {width: 375, height: 812}},
  webServer: {command: 'node scripts/serve.mjs', env: {PORT: '8791'}, url: 'http://127.0.0.1:8791', reuseExistingServer: false}
});
