const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('both subject titles are plain text, without dialog attributes',()=>{
    const html=read('static/index.html');
    for(const id of ['current-subject','next-subject']) {
        assert.ok(html.includes(`<div class="lesson-subject" id="${id}">`));
    }
    assert.ok(!html.includes('subject-details'));
    assert.ok(!html.includes('Повна назва предмета'));
});
test('compact layout has no timer overrides or subject line clamping',()=>{
    const css=read('static/css/mobile-fit.css');
    assert.ok(!/\.timer-(svg|main|sub|widget|display)/.test(css));
    assert.ok(!css.includes('line-clamp'));
    assert.ok(!read('static/css/responsive.css').includes('.timer-svg'));
    assert.ok(css.includes('padding: 6px 10px'));
});
test('teacher module no longer creates dialogs or listens for clicks',()=>{
    const source=read('static/js/teacher-hints.js');
    assert.ok(!source.includes('showModal'));
    assert.ok(!source.includes("addEventListener('click'"));
    assert.ok(!source.includes('subject-details'));
    assert.ok(!source.includes('teacher-trigger'));
});
