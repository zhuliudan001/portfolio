const test = require('node:test');
const assert = require('node:assert');
const { esc, contrast, luminance, normalizeHex } = require('../scripts/util.js');

test('esc 转义 HTML 特殊字符', () => {
  assert.strictEqual(esc('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;');
  assert.strictEqual(esc('飞鹰传媒'), '飞鹰传媒');
});

test('contrast 计算 WCAG 相对亮度比', () => {
  assert.ok(Math.abs(contrast('#111111', '#ffffff') - 18.88) < 0.02);
  assert.ok(Math.abs(contrast('#767676', '#ffffff') - 4.54) < 0.02);
  assert.strictEqual(contrast('#ffffff', '#ffffff'), 1);
});

test('颜色形状：3 位缩写可用，非法值抛错而非返回 NaN', () => {
  assert.strictEqual(luminance('#fff'), 1);
  assert.strictEqual(luminance('fff'), 1);
  assert.strictEqual(luminance('#FFF'), 1);
  assert.strictEqual(luminance('#000000'), 0);
  assert.strictEqual(contrast('#fff', '#111'), contrast('#ffffff', '#111111'));
  assert.strictEqual(normalizeHex('#0e0e0e'), '0e0e0e');
  for (const bad of ['#12345', '#gggggg', '', '  ', '#12345678', null, undefined, 42, {}]) {
    assert.throws(() => luminance(bad), /格式非法|必须是字符串/, `非法值未抛错：${String(bad)}`);
  }
});

test('单引号转义（模板属性会用到）', () => {
  assert.strictEqual(esc("it's"), 'it&#39;s');
});
