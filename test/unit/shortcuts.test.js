import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFindShortcut } from '../../extension/lib/shortcuts.js';

const key = (k, mods = {}) => ({
  key: k,
  code: /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k,
  ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

test('윈도우·리눅스: Ctrl+F, Ctrl+G, Ctrl+Shift+G, F3, Shift+F3', () => {
  for (const e of [
    key('f', { ctrlKey: true }),
    key('F', { ctrlKey: true, shiftKey: true }),
    key('g', { ctrlKey: true }),
    key('G', { ctrlKey: true, shiftKey: true }),
    key('F3'),
    key('F3', { shiftKey: true }),
  ]) assert.equal(isFindShortcut(e), true, JSON.stringify(e));
});

test('맥: Cmd+F, Cmd+G, Cmd+Shift+G. Ctrl+F는 커서 이동이라 막지 않는다', () => {
  const mac = { mac: true };
  assert.equal(isFindShortcut(key('f', { metaKey: true }), mac), true);
  assert.equal(isFindShortcut(key('g', { metaKey: true }), mac), true);
  assert.equal(isFindShortcut(key('G', { metaKey: true, shiftKey: true }), mac), true);
  assert.equal(isFindShortcut(key('f', { ctrlKey: true }), mac), false);
  assert.equal(isFindShortcut(key('f', { metaKey: true }), { mac: false }), false);
});

test('한글 자판에서는 key 대신 code로 본다', () => {
  assert.equal(isFindShortcut({ key: 'ㄹ', code: 'KeyF', metaKey: true }, { mac: true }), true);
  assert.equal(isFindShortcut({ key: 'ㅎ', code: 'KeyG', ctrlKey: true }), true);
  assert.equal(isFindShortcut({ key: 'ㄹ', code: 'KeyF' }), false);
});

test('다른 자판 배열에서는 글자(key)를 따른다', () => {
  // 드보락에서 F 글자는 물리 키 Y 자리에 있다
  assert.equal(isFindShortcut({ key: 'f', code: 'KeyY', ctrlKey: true }), true);
  assert.equal(isFindShortcut({ key: 'u', code: 'KeyF', ctrlKey: true }), false);
});

test('찾기가 아닌 키는 그대로 둔다', () => {
  for (const e of [
    key('f'),
    key('F3', { ctrlKey: true }),
    key('f', { ctrlKey: true, altKey: true }),
    key('f', { ctrlKey: true, metaKey: true }),
    key('c', { ctrlKey: true }),
    key('l', { ctrlKey: true }),
    key('Enter'),
  ]) assert.equal(isFindShortcut(e), false, JSON.stringify(e));
  assert.equal(isFindShortcut(null), false);
});
