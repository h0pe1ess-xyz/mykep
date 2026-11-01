'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function run() {
    const server = await startFixtureServer();
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext();
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        await page.addInitScript(() => {
            sessionStorage.setItem('mykep_browser_session', 'yes');
            localStorage.setItem('mykep_onboarded', 'true');
            localStorage.setItem('mykep_group', 'ПІ-24-02');
            window.auditBoot = Number(sessionStorage.getItem('audit-boots') || 0) + 1;
            sessionStorage.setItem('audit-boots', String(window.auditBoot));
        });
        await page.goto(server.url);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        assert.equal(await page.evaluate(() => window.auditBoot), 1, 'first installation should not reload');

        server.setBuild('audit-failed');
        server.breakAsset(true);
        await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            await registration.update();
            const worker = registration.installing;
            if (worker && worker.state !== 'redundant') await new Promise(resolve => {
                worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
            });
        });
        assert.equal(await page.evaluate(() => window.auditBoot), 1);
        assert.equal(await page.evaluate(() => caches.has('mykep-cache-vaudit-failed')), false,
            'a rejected installation must not leave an empty or partial shell cache');

        server.breakAsset(false);
        server.setBuild('audit-upgrade');
        await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
        await page.waitForFunction(() => window.auditBoot === 2);
        assert.equal(await page.evaluate(async () => (await caches.keys()).filter(n => n.startsWith('mykep-cache-')).length), 1);
        assert.equal(await page.evaluate(() => caches.has('mykep-cache-vaudit-upgrade')), true);
        await context.setOffline(true);
        await page.reload();
        await page.waitForFunction(() => typeof App !== 'undefined' && typeof Tabs !== 'undefined');
        console.log('Chromium: first install, failed update cleanup, same-tab upgrade reload, offline reload passed');
    } finally {
        await browser.close();
        await server.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
