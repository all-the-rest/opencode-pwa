/**
 * Simple i18n gate: re-extract the Lingui catalog, re-compile it, then fail
 * when an extracted msgid is missing from the compiled catalog (a stale
 * catalog would ship message IDs instead of German text).
 *
 * Deliberately simple: no AST scan for unwrapped strings (see AGENTS.todo W3).
 * Compiled keys are hashes (Lingui v5+ default), so the expected key per
 * msgid is derived with the same `generateMessageId` the compiler uses.
 */
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const poPath = join(rootDir, "locale", "de", "messages.po")
const jsPath = join(rootDir, "locale", "de", "messages.js")

const require = createRequire(join(rootDir, "package.json"))
const { generateMessageId } = require("@lingui/message-utils/generateMessageId")

function run(command) {
  execSync(command, { cwd: rootDir, stdio: "inherit" })
}

/**
 * Collect [msgid, context] pairs from a .po file, honouring ""
 * continuation lines. Entries without msgctxt get context "".
 */
function readEntries(source) {
  const entries = []
  const lines = source.split("\n")
  let msgid = null
  let context = ""
  let section = null
  const flush = () => {
    if (msgid !== null && msgid !== "") entries.push([msgid, context])
    msgid = null
    context = ""
    section = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith("msgid ")) {
      flush()
      section = "id"
      msgid = JSON.parse(line.slice("msgid ".length))
    } else if (line.startsWith("msgctxt ")) {
      section = "context"
      context = JSON.parse(line.slice("msgctxt ".length))
    } else if (line.startsWith('"') && section !== null) {
      if (section === "id") msgid += JSON.parse(line)
      else context += JSON.parse(line)
    } else if (line.startsWith("msgstr")) {
      section = null
    } else if (line === "") {
      flush()
    }
  }
  flush()
  return entries
}

run("pnpm lingui extract")
run("pnpm lingui compile")

const entries = readEntries(readFileSync(poPath, "utf8"))
const compiledSource = readFileSync(jsPath, "utf8")
const missing = entries
  .map(([id, context]) => ({ id, key: generateMessageId(id, context) }))
  // The compiled catalog embeds JSON in a JS string literal, so keys appear
  // escape-quoted (`\"<hash>\":`).
  .filter(({ key }) => !compiledSource.includes(`\\"${key}\\":`))

if (missing.length > 0) {
  console.error(
    `check-i18n: ${missing.length} message(s) missing from the compiled catalog:\n` +
      missing.map(({ id }) => `  - ${id}`).join("\n"),
  )
  process.exit(1)
}

console.log(`check-i18n: ok (${entries.length} message(s) in sync)`)
