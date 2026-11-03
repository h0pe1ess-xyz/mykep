import {readFileSync} from 'node:fs';
import globals from 'globals';

// Public classic scripts share one scope in the order declared by index.html.
const html = readFileSync('static/index.html', 'utf8');
const publicGlobals = {};
for (const match of html.matchAll(/src="(\/js\/[^"?]+)[^"]*"/g)) {
    const source = readFileSync('static' + match[1], 'utf8');
    for (const declaration of source.matchAll(/^(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)) {
        publicGlobals[declaration[1]] = 'readonly';
    }
}

export default [{
    ignores: ['node_modules/**', '.venv/**', '.mykep-local/**']
}, {
    files: ['static/**/*.js', 'admin_static/**/*.js', 'scripts/*.cjs', 'tests/*.cjs'],
    languageOptions: {ecmaVersion: 'latest', sourceType: 'script'},
    rules: {
        'constructor-super': 'error',
        'for-direction': 'error',
        'no-async-promise-executor': 'error',
        'no-constant-binary-expression': 'error',
        'no-dupe-args': 'error',
        'no-dupe-else-if': 'error',
        'no-dupe-keys': 'error',
        'no-duplicate-case': 'error',
        'no-promise-executor-return': 'error',
        'no-self-assign': 'error',
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-unused-vars': ['error', {vars: 'local', args: 'none', caughtErrors: 'none'}],
        'valid-typeof': 'error'
    }
}, {
    files: ['static/js/*.js'],
    languageOptions: {globals: {...globals.browser, ...publicGlobals}},
    rules: {'no-undef': 'error'}
}, {
    files: ['admin_static/*.js', 'static/sw.js'],
    languageOptions: {globals: {...globals.browser, ...globals.serviceworker}},
    rules: {'no-undef': 'error'}
}];
