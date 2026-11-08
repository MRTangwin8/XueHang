import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickLang, translate } from './index'
import { languages } from './lang'
import { messages } from './messages'

test('language negotiation respects weights, regions, exclusions, and fallback', () => {
  assert.equal(pickLang(), 'zh-CN')
  assert.equal(pickLang('unknown'), 'zh-CN')
  assert.equal(pickLang('en;q=0, ja-JP;q=0.8, fr;q=0.9'), 'fr')
  assert.equal(pickLang('zh-TW;q=0.9,en;q=0.8'), 'zh-CN')
  assert.equal(pickLang('pt-BR'), 'pt')
  assert.equal(pickLang('xx;q=1, de-DE;q=0.7'), 'de')
  assert.equal(pickLang('fr;q=invalid, es;q=0.5'), 'es')
  assert.equal(pickLang('ru;q=2, en;q=-1, ja;q=0'), 'zh-CN')
  assert.equal(pickLang('en;q=0.8,ja;q=0.8'), 'en')
  for (const lang of languages) assert.equal(pickLang(lang), lang)
})

test('exact messages, source language, and unknown messages preserve their contract', () => {
  assert.equal(translate('请先登录', 'en'), 'Please sign in first')
  assert.equal(translate('请先登录', 'ja'), 'ログインしてください')
  assert.equal(translate('未知的业务内容', 'en'), '未知的业务内容')
  assert.equal(translate('constructor', 'en'), 'constructor')
  assert.equal(translate('参数错误（password）：密码至少 8 位', 'zh-CN'), '参数错误（password）：密码至少 8 位')
})

test('patterns preserve arguments, escape punctuation, and recursively translate nested messages', () => {
  assert.equal(translate('账号或密码错误（再错 2 次将锁定 15 分钟）', 'en'),
    'Incorrect account or password (2 more failed attempts will lock the account for 15 minutes)')
  assert.equal(translate('参数错误（password）：密码至少 8 位', 'en'),
    'Invalid parameter (password): The password must be at least 8 characters')
  assert.equal(translate('参数错误：请先登录', 'ja'), '入力エラー：ログインしてください')
  assert.equal(translate('参数错误（body）：参数错误（password）：原密码错误', 'en'),
    'Invalid parameter (body): Invalid parameter (password): Incorrect current password')
  assert.equal(translate('剩余课时不足：「VIP [A].*」剩余 1.5h，本次需要 2h', 'en'),
    'Insufficient hours: “VIP [A].*” has 1.5h remaining; 2h required')
  assert.equal(translate('担当老师：只能选择教师身份的工号', 'ja'), '担当講師：講師の職員番号のみ選択できます')
  assert.ok(!translate('该账号是最后一个有效的超级管理员（拥有全部权限），不能删除', 'en').includes('删除'))
  assert.equal(translate('仅支持 a$&\nb 格式', 'en'), 'Only a$&\nb formats are supported')
})

test('every catalog pattern matches concrete arguments in all seven target languages', () => {
  for (const [source, texts] of Object.entries(messages)) {
    const concrete = source.replace(/\{(\d+)\}/g, (_, index: string) => `ARG_${index}`)
    for (const lang of languages) {
      if (lang === 'zh-CN') continue
      const expected = texts[lang].replace(/\{(\d+)\}/g, (_, index: string) => `ARG_${index}`)
      assert.equal(translate(concrete, lang), expected, `${lang}: ${source}`)
    }
  }
})
