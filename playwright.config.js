import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'test',
    testMatch: /.*\.spec\.js$/,
    testIgnore: /webpack\//,
    timeout: 30000,
    fullyParallel: true,
    reporter: [['list']],
    use: { baseURL: 'http://localhost:4173', viewport: { width: 1000, height: 900 } },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 900 } } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1000, height: 900 } } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1000, height: 900 } } },
    ],
    webServer: { command: 'node test/server.mjs 4173', port: 4173, reuseExistingServer: true },
});
