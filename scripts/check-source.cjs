'use strict';
const {execFileSync,spawnSync}=require('node:child_process');

const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const localOnly=files.filter(file=>/^(?:docs|tests)(?:\/|$)|^admin\.md$/i.test(file));
if(localOnly.length) {
    console.error('Local-only files must not be tracked:\n'+localOnly.join('\n'));
    process.exit(1);
}
const scripts=files.filter(file=>/\.(?:js|cjs|mjs)$/.test(file));
let failed=false;
for(const file of scripts) {
    const result=spawnSync(process.execPath,['--check','./'+file],{stdio:'inherit'});
    if(result.error) console.error(result.error.message);
    if(result.status!==0) failed=true;
}
if(!failed) console.log(`${scripts.length} JavaScript files checked; local-only paths are not tracked`);
process.exitCode=failed?1:0;
