import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputIndex = process.argv.indexOf('--npm-ls-json')
const inputFile = inputIndex >= 0 ? process.argv[inputIndex + 1] : null
let npmLsJson = ''
let npmLsError = ''
if (inputFile) {
  npmLsJson = readFileSync(path.resolve(root, inputFile), 'utf8')
} else {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm ls --omit=dev --all --json']
    : ['ls', '--omit=dev', '--all', '--json']
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  npmLsJson = result.stdout ?? ''
  npmLsError = result.stderr ?? result.error?.message ?? ''
}

if (!npmLsJson.trim()) {
  process.stderr.write(npmLsError || 'npm ls 未返回 JSON\n')
  process.exit(1)
}

let tree
try {
  tree = JSON.parse(npmLsJson.replace(/^\uFEFF/, ''))
} catch (error) {
  console.error(`无法解析 npm ls 输出：${error.message}`)
  process.exit(1)
}

const packages = new Map()
const visitedDirs = new Set()

function readPackage(dir) {
  const file = path.join(dir, 'package.json')
  if (!existsSync(file)) return
  let real
  try {
    real = realpathSync(dir)
  } catch {
    return
  }
  if (visitedDirs.has(real)) return
  visitedDirs.add(real)
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    if (!pkg.name || !pkg.version) return
    const key = `${pkg.name}@${pkg.version}`
    const license = typeof pkg.license === 'string' ? pkg.license.trim() : ''
    if (!packages.has(key) || license) packages.set(key, { name: pkg.name, version: pkg.version, license: license || '未声明' })
  } catch {
    // 非法或不可读的 package.json 不参与统计。
  }
}

function scanNodeModules(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(full, { withFileTypes: true })) {
        if (scoped.isDirectory()) scanPackageDir(path.join(full, scoped.name))
      }
    } else {
      scanPackageDir(full)
    }
  }
}

function scanPackageDir(dir) {
  readPackage(dir)
  scanNodeModules(path.join(dir, 'node_modules'))
}

scanNodeModules(path.join(root, 'node_modules'))
for (const workspace of ['server', 'web']) scanNodeModules(path.join(root, workspace, 'node_modules'))

const pathsByPackage = new Map()
const runtimeKeys = new Set()

function walk(dependencies, chain = []) {
  for (const [name, node] of Object.entries(dependencies ?? {})) {
    if (!node || typeof node !== 'object') continue
    const version = typeof node.version === 'string' ? node.version : ''
    const key = version ? `${name}@${version}` : name
    const next = [...chain, key]
    if (version) runtimeKeys.add(key)
    const paths = pathsByPackage.get(key) ?? []
    if (paths.length < 5) paths.push(next.join(' > '))
    pathsByPackage.set(key, paths)
    walk(node.dependencies, next)
  }
}

walk(tree.dependencies)

const records = [...runtimeKeys].map((key) => packages.get(key) ?? {
  name: key.slice(0, key.lastIndexOf('@')),
  version: key.slice(key.lastIndexOf('@') + 1),
  license: '未声明',
})
records.sort((a, b) => a.license.localeCompare(b.license) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

const groups = new Map()
for (const pkg of records) groups.set(pkg.license, [...(groups.get(pkg.license) ?? []), pkg])

console.log('运行依赖许可证统计（按 name@version 去重）')
for (const [license, items] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${license}: ${items.length}`)

const reviewPattern = /(?:^|[^A-Z])(AGPL|GPL|LGPL|SSPL|EUPL|MPL|EPL|CDDL)(?:[^A-Z]|$)/i
const flagged = records.filter((pkg) => pkg.license === '未声明' || reviewPattern.test(pkg.license))
console.log(`\n需人工复核：${flagged.length}`)
for (const pkg of flagged) {
  const key = `${pkg.name}@${pkg.version}`
  console.log(`\n- ${key} [${pkg.license}]`)
  for (const dependencyPath of pathsByPackage.get(key) ?? ['依赖路径不可用']) console.log(`  ${dependencyPath}`)
}

if (tree.problems?.length) {
  console.log('\nnpm ls 报告的问题（不影响已解析依赖的许可证统计）：')
  for (const problem of tree.problems) console.log(`- ${problem}`)
}
