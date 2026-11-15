// Uso: node cdp.mjs <archivo-con-expresion.js>  -> evalúa en la WebView y muestra el resultado
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const adb = process.env.LOCALAPPDATA + '/Android/Sdk/platform-tools/adb.exe'
const pid = execFileSync(adb, ['shell', 'pidof', 'com.gaelgarza.realliferpg']).toString().trim()
if (!pid) { console.error('app no corre'); process.exit(2) }
execFileSync(adb, ['forward', 'tcp:9229', `localabstract:webview_devtools_remote_${pid}`])
const pages = await (await fetch('http://127.0.0.1:9229/json')).json()
const page = pages.find((p) => p.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
const expression = readFileSync(process.argv[2], 'utf8')
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id !== 1) return
  const r = d.result
  if (r.exceptionDetails) console.log('EXC', JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1))
  ws.close(); process.exit(0)
}
