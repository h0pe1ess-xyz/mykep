'use strict';
const {spawnSync} = require('node:child_process');

for (const name of ['browser', 'schedule-browser', 'theme-browser', 'bells-browser',
    'cache-recovery-browser', 'usage-browser', 'fresh-install-browser', 'swipe-modes-browser', 'android-browser', 'admin-browser']) {
    const result = spawnSync(process.execPath, [`tests/${name}.cjs`], {stdio:'inherit', timeout:300000});
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}
