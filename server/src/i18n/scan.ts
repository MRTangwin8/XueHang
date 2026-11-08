import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const chinese = /[\u3400-\u9fff]/u
const errors = new Set(['badRequest', 'forbidden', 'notFound', 'conflict', 'unauthorized', 'AppError'])
const validators = new Set([
  'min', 'max', 'length', 'refine', 'superRefine', 'regex', 'int', 'positive', 'nonnegative', 'negative',
  'nonpositive', 'nonempty', 'email', 'url', 'uuid', 'datetime', 'date', 'time', 'multipleOf', 'gt', 'gte', 'lt', 'lte',
])

/** Scan syntax rather than source lines, including multiline calls and conditional messages. */
export function scanMessages(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const root = fileURLToPath(new URL('../', import.meta.url))
  function scan(file: string) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    function collect(node: ts.Node) {
      let message: string | undefined
      if (ts.isStringLiteralLike(node)) message = node.text
      if (ts.isTemplateExpression(node)) {
        message = node.head.text + node.templateSpans.map((s, i) => `{${i}}${s.literal.text}`).join('')
      }
      if (message !== undefined) {
        if (chinese.test(message)) {
          const location = `${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
          found.set(message, [...(found.get(message) ?? []), location])
        }
        return
      }
      ts.forEachChild(node, collect)
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const name = ts.isIdentifier(node.expression) ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ''
        if (errors.has(name)) {
          const argument = node.arguments?.[name === 'AppError' ? 1 : 0]
          if (argument) collect(argument)
        } else if (name === 'ensureNotLastSuper' && node.arguments?.[1]) {
          // This local helper inserts its second argument into an AppError message.
          collect(node.arguments[1])
        } else if (validators.has(name)) {
          for (const argument of node.arguments ?? []) collect(argument)
        }
      }
      if (ts.isForOfStatement(node) && node.initializer.getText(source).includes('[field, label]')) {
        // Student validation inserts these locally defined teacher labels into its message.
        const unwrap = ts.isAsExpression(node.expression) ? node.expression.expression : node.expression
        if (ts.isArrayLiteralExpression(unwrap)) {
          for (const element of unwrap.elements) {
            if (ts.isArrayLiteralExpression(element) && element.elements[1]) collect(element.elements[1])
          }
        }
      }
      if (ts.isPropertyAssignment(node)) {
        const name = ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ? node.name.text : node.name.getText(source)
        if (['message', 'error', 'reason'].includes(name)) collect(node.initializer)
      }
      if (file.endsWith(`${path.sep}errors.ts`) && ts.isParameter(node) && node.initializer) collect(node.initializer)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['generated', 'i18n', 'node_modules'].includes(entry.name)) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.[cm]?ts$/.test(entry.name)) scan(file)
    }
  }
  walk(root)
  // lib/http.ts conditionally inserts full-width parentheses around the issue path.
  found.delete('参数错误{0}：{1}')
  found.set('参数错误（{0}）：{1}', ['lib/http.ts'])
  found.set('参数错误：{0}', ['lib/http.ts'])
  return found
}
