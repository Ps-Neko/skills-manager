// test/scanner.test.mjs — frontmatter 파서(readFM)·인벤토리 수집의 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFM, scanInventory } from '../scanner.mjs';

function tmpFile(content) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-fm-'));
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, content);
  return f;
}

test('readFM: 단일행 name/description', () => {
  const f = tmpFile('---\nname: foo\ndescription: 한 줄 설명\n---\n본문');
  assert.deepStrictEqual(readFM(f), { name: 'foo', description: '한 줄 설명' });
});

test('readFM: 따옴표 안 콜론도 안전("foo: bar")', () => {
  const f = tmpFile('---\nname: foo\ndescription: "foo: bar"\n---\n');
  assert.strictEqual(readFM(f).description, 'foo: bar');
});

test('readFM: YAML folded block(>) 여러 줄을 한 문장으로', () => {
  const f = tmpFile('---\nname: foo\ndescription: >\n  long text\n  continues here\n---\n');
  assert.strictEqual(readFM(f).description, 'long text continues here');
});

test('readFM: literal block(|) 여러 줄', () => {
  const f = tmpFile('---\nname: foo\ndescription: |\n  line one\n  line two\n---\n');
  assert.strictEqual(readFM(f).description, 'line one line two');
});

test('readFM: 값 비고 다음 줄 들여쓰기면 그 줄들을 잇는다', () => {
  const f = tmpFile('---\nname: foo\ndescription:\n  wrapped one\n  wrapped two\n---\n');
  assert.strictEqual(readFM(f).description, 'wrapped one wrapped two');
});

test('readFM: frontmatter 없으면 빈 객체', () => {
  const f = tmpFile('# 그냥 마크다운\n내용');
  assert.deepStrictEqual(readFM(f), {});
});

test('readFM: BOM 있어도 파싱', () => {
  const f = tmpFile('﻿---\nname: foo\ndescription: bar\n---\n');
  assert.strictEqual(readFM(f).name, 'foo');
});

// 플러그인 short 이름 충돌 시 출처 라벨이 합쳐지지 않고 마켓으로 구분되는지.
test('scanInventory: 같은 short 가 다른 마켓에서 오면 출처가 합쳐지지 않는다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-scan-'));
  const CLAUDE = path.join(home, '.claude');
  const SKILLS = path.join(CLAUDE, 'skills');
  const PLUGINS = path.join(CLAUDE, 'plugins');
  const AGENTS = path.join(CLAUDE, 'agents');
  fs.mkdirSync(SKILLS, { recursive: true });
  fs.mkdirSync(PLUGINS, { recursive: true });

  // 두 마켓에 같은 short 'dup' 플러그인, 각자 스킬 하나.
  const mk = (rel, name) => {
    const d = path.join(...rel);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: x\n---\n`);
    return d;
  };
  const instA = mk([PLUGINS, 'cacheA', 'dup', '1', 'skills', 'alpha'], 'alpha');
  const instB = mk([PLUGINS, 'cacheB', 'dup', '1', 'skills', 'beta'], 'beta');
  fs.writeFileSync(path.join(PLUGINS, 'installed_plugins.json'), JSON.stringify({
    plugins: {
      'dup@marketA': [{ installPath: path.join(PLUGINS, 'cacheA', 'dup', '1') }],
      'dup@marketB': [{ installPath: path.join(PLUGINS, 'cacheB', 'dup', '1') }],
    },
  }));

  const { uniq, plugins } = scanInventory({ SKILLS, CLAUDE, PLUGINS, AGENTS });
  const labels = new Set(plugins.map((p) => p.label));
  assert.ok(labels.has('dup@marketA') && labels.has('dup@marketB'), '충돌 short 는 마켓으로 구분');
  const srcs = new Set(uniq.map((it) => it.source));
  assert.ok(srcs.has('dup@marketA') && srcs.has('dup@marketB'), '스킬 출처도 구분되어 합쳐지지 않음');
});

test('scanInventory: enabledPlugins(settings+local 병합)가 plugins[].enabled 로 전파', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-scan-'));
  const CLAUDE = path.join(home, '.claude');
  const SKILLS = path.join(CLAUDE, 'skills');
  const PLUGINS = path.join(CLAUDE, 'plugins');
  const AGENTS = path.join(CLAUDE, 'agents');
  fs.mkdirSync(SKILLS, { recursive: true });
  const d = path.join(PLUGINS, 'cache', 'p', '1', 'skills', 's');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), '---\nname: s\ndescription: x\n---\n');
  fs.writeFileSync(path.join(PLUGINS, 'installed_plugins.json'), JSON.stringify({
    plugins: { 'p@market': [{ installPath: path.join(PLUGINS, 'cache', 'p', '1') }] },
  }));
  fs.writeFileSync(path.join(CLAUDE, 'settings.json'), JSON.stringify({ enabledPlugins: { 'p@market': false } }));
  fs.writeFileSync(path.join(CLAUDE, 'settings.local.json'), JSON.stringify({ enabledPlugins: { 'p@market': true } }));
  const { plugins } = scanInventory({ SKILLS, CLAUDE, PLUGINS, AGENTS });
  assert.strictEqual(plugins[0].enabled, true, 'local override(true)가 settings.json(false)를 이긴다');
});

test('scanInventory: short 충돌이 없으면 깔끔한 short 그대로', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-scan-'));
  const CLAUDE = path.join(home, '.claude');
  const SKILLS = path.join(CLAUDE, 'skills');
  const PLUGINS = path.join(CLAUDE, 'plugins');
  const AGENTS = path.join(CLAUDE, 'agents');
  fs.mkdirSync(SKILLS, { recursive: true });
  fs.mkdirSync(PLUGINS, { recursive: true });
  const d = path.join(PLUGINS, 'cache', 'solo', '1', 'skills', 'one');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), '---\nname: one\ndescription: x\n---\n');
  fs.writeFileSync(path.join(PLUGINS, 'installed_plugins.json'), JSON.stringify({
    plugins: { 'solo@market': [{ installPath: path.join(PLUGINS, 'cache', 'solo', '1') }] },
  }));
  const { plugins } = scanInventory({ SKILLS, CLAUDE, PLUGINS, AGENTS });
  assert.strictEqual(plugins[0].label, 'solo', '충돌 없으면 short 그대로');
});
