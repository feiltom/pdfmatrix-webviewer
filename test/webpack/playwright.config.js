import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: /webpack\.spec\.js$/,
    timeout: 30000,
    reporter: [['list']],
    use: { baseURL: 'http://localhost:4174' },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
    webServer: { command: 'node ../server.mjs 4174 test/webpack/out/dist', port: 4174, reuseExistingServer: true },
});
