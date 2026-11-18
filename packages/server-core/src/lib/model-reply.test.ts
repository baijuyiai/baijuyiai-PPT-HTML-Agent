import test from 'node:test';
import assert from 'node:assert/strict';

const { stripHtmlReply } = await import('./model-reply.js');

/**
 * 模型回复的清洗。
 *
 * 这一层看着琐碎，但踩过一次真的：模型在代码前面写了一句
 * 「这是为您准备的封面 HTML 代码，采用 1920×1080 固定画布……」，
 * 只去首尾围栏是拦不住的——那句话留在片段最前面，被当成正文渲染到页面顶上，
 * 样机顶部糊了一大段中文说明。
 *
 * 原先这份用例挂在 `services/recognize-doc.test.ts` 名下，而它**从头到尾
 * 只测 `stripHtmlReply`**、一次都没引用过 `runDocRecognition`——文件名在
 * 宣称一份它并不拥有的覆盖。现在放回被测模块自己身边（`lib/`），
 * `recognize-doc.test.ts` 那个名字留给真正跑全量识别的用例。
 */

test('带 ```html 围栏时取围栏里的内容', () => {
  const reply = '```html\n<style>.a{}</style><div>x</div>\n```';
  assert.equal(stripHtmlReply(reply), '<style>.a{}</style><div>x</div>');
});

test('围栏前面有前言时，前言要被切掉', () => {
  const reply = '这是为您准备的封面 HTML 代码，采用 1920×1080 固定画布，暖米纸色底。\n\n```html\n<div class="slide">内容</div>\n```';
  const out = stripHtmlReply(reply);
  assert.equal(out, '<div class="slide">内容</div>');
  assert.ok(!out.includes('这是为您准备'), '前言不能留在片段里');
});

test('没有围栏但前面有前言时也要切掉', () => {
  const reply = '好的，这是代码：\n<style>.a{}</style><div>x</div>';
  assert.equal(stripHtmlReply(reply), '<style>.a{}</style><div>x</div>');
});

test('本来就干净的原样返回', () => {
  const clean = '<style>.a{}</style><div>x</div>';
  assert.equal(stripHtmlReply(clean), clean);
});

test('从 <style> 或 <div> 开始都认——模型不一定先给 style', () => {
  assert.equal(stripHtmlReply('前言\n<div>x</div>'), '<div>x</div>');
  assert.equal(stripHtmlReply('前言\n<section>x</section>'), '<section>x</section>');
});

test('空回复不炸', () => {
  assert.equal(stripHtmlReply(''), '');
});

/**
 * 剥 script。
 *
 * 模型很爱加一段「读取 window.innerWidth / innerHeight，把 scale 写进 --scale」
 * 的画布适配脚本，而这条链路里脚本永远不会被执行（iframe 不开 allow-scripts），
 * 缩放本来就由外层容器的 transform: scale() 负责。不剥的话每一张样机都要先被 lint
 * 判「HTML 不得包含 script 标签」再重试一次——实测 11 页重试 12 次，出样机时间翻倍。
 */

test('成对的 script 块被剥掉，其余原样', () => {
  const reply = [
    '<style>.stage{width:1920px}</style>',
    '<script>const s=Math.min(innerWidth/1920,innerHeight/1080);',
    'document.documentElement.style.setProperty("--scale",s);</script>',
    '<div class="slide">内容</div>',
  ].join('');
  const out = stripHtmlReply(reply);
  assert.equal(out, '<style>.stage{width:1920px}</style><div class="slide">内容</div>');
  assert.ok(!out.includes('innerWidth'), '脚本正文不能留下');
});

test('带属性的 script 也剥——模型会写 type="module" 或 src', () => {
  assert.equal(
    stripHtmlReply('<div>a</div><script type="module">x()</script>'),
    '<div>a</div>',
  );
  assert.equal(
    stripHtmlReply('<div>a</div><script src="//cdn/x.js" defer></script>'),
    '<div>a</div>',
  );
});

test('脚本在片段最前面时也剥得掉——前言切分认不出 script 这个标签', () => {
  const reply = '<script>resize()</script>\n<style>.a{}</style><div>x</div>';
  assert.equal(stripHtmlReply(reply), '<style>.a{}</style><div>x</div>');
});

test('没有闭合标签的残缺 script 留着——那是真问题，该让 lint 拦下来', () => {
  const reply = '<style>.a{}</style><div>x</div><script>resize()';
  const out = stripHtmlReply(reply);
  assert.ok(out.includes('<script>'), '残缺的不能悄悄吞掉');
});

test('多段 script 全剥，不留空壳', () => {
  const reply = '<script>a()</script><div>x</div><script>b()</script>';
  assert.equal(stripHtmlReply(reply), '<div>x</div>');
});
