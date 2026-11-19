'use strict';

// One build serves both domains. Other hosts keep the production identity.
const AppBrand = Object.freeze({
    isTest: location.hostname.toLowerCase() === 'testkep.oddxq.dev',
    get name() { return this.isTest ? 'TestKep' : 'MyKep'; },
    get icon() { return this.isTest ? '/icons/test-192.png' : '/icons/icon-192.png'; },
    text(value) { return this.isTest ? value.replace(/\bMyKep\b/g, this.name) : value; }
});

if (AppBrand.isTest) {
    document.title = AppBrand.text(document.title);
    document.querySelectorAll('meta[name="application-name"], meta[name="apple-mobile-web-app-title"], meta[property="og:site_name"]').forEach(meta => {
        meta.content = AppBrand.name;
    });
    document.querySelector('link[rel="manifest"]').href = '/manifest-test.json';
    const icon = document.querySelector('link[rel="icon"]');
    icon.href = AppBrand.icon;
    icon.type = 'image/png';
    document.querySelector('link[rel="apple-touch-icon"]').href = AppBrand.icon;
    document.querySelector('meta[name="robots"]').content = 'noindex, nofollow';
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-app-brand], .app-header .app-title, .view-settings .location-badge').forEach(node => {
            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) child.textContent = AppBrand.text(child.textContent);
            }
        });
    }, {once:true});
}
