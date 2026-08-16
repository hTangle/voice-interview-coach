#!/usr/bin/env node
/*
 * Verifies that package.json contains the minimum fields DSH needs to
 * discover and load a web plugin:
 *   - dsh.id, dsh.name, dsh.kind
 *   - dsh.host / dsh.client point to existing files
 *   - required host services are declared
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const errors = []
function check(cond, msg) { if (!cond) errors.push(msg) }

check(pkg.dsh, 'package.json is missing the "dsh" manifest block')
if (pkg.dsh) {
  check(pkg.dsh.id, 'dsh.id is required')
  check(pkg.dsh.name, 'dsh.name is required')
  check(pkg.dsh.kind === 'web', 'dsh.kind must be "web" for this plugin')
  check(pkg.dsh.host && fs.existsSync(path.join(root, pkg.dsh.host)),
    'dsh.host (' + pkg.dsh.host + ') does not exist')
  check(pkg.dsh.client && fs.existsSync(path.join(root, pkg.dsh.client)),
    'dsh.client (' + pkg.dsh.client + ') does not exist')
  check(Array.isArray(pkg.dsh.requiredServices) && pkg.dsh.requiredServices.includes('llm'),
    'dsh.requiredServices must include "llm"')
}

if (errors.length) {
  console.error('✖ package.json verification failed:')
  errors.forEach(e => console.error('  - ' + e))
  process.exit(1)
}
console.log('✓ package.json manifest looks valid for plugin', pkg.dsh.id)
