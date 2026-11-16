const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const LOCAL_BIN = path.join(__dirname, 'bin', 'yt-dlp')
const list = (v, d) => (v || d).split(',').map(s => s.trim()).filter(Boolean)
const S = { bin: 'yt-dlp', js: [], err: null, cookies: [] }
const INVIDIOUS = list(process.env.INVIDIOUS, 'https://inv.nadeko.net,https://yewtu.be,https://invidious.nerdvpn.de')
const PIPED = list(process.env.PIPED, 'https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de')
const CLIENTS = ['tv', 'android_vr', 'mweb']
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'

const errMsg = e => (e && (e.message || String(e))) || 'error desconocido'
const host = u => { try { return new URL(u).host } catch { return u } }
const works = b => { try { return spawnSync(b, ['--version'], { timeout: 30000 }).status === 0 } catch { return false } }

async function setup() {
  if (fs.existsSync(LOCAL_BIN) && works(LOCAL_BIN)) S.bin = LOCAL_BIN
  else if (works('yt-dlp')) S.bin = 'yt-dlp'
  else if (os.platform() === 'linux' && !(process.env.PREFIX || '').includes('termux')) {
    console.log('⬇️ yt-dlp no encontrado, descargando...')
    const asset = os.arch() === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
    const r = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`, { redirect: 'follow' })
    if (!r.ok) throw new Error('No pude descargar yt-dlp (HTTP ' + r.status + ')')
    fs.mkdirSync(path.dirname(LOCAL_BIN), { recursive: true })
    fs.writeFileSync(LOCAL_BIN, Buffer.from(await r.arrayBuffer()))
    fs.chmodSync(LOCAL_BIN, 0o755)
    if (!works(LOCAL_BIN)) throw new Error('yt-dlp se descargó pero no se puede ejecutar')
    S.bin = LOCAL_BIN
  } else throw new Error('yt-dlp no está instalado (en Termux: pkg install yt-dlp)')
  try {
    const h = spawnSync(S.bin, ['--help'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 })
    if ((h.stdout || '').includes('--js-runtimes')) S.js = ['--js-runtimes', 'node']
  } catch {}
  console.log('✅ yt-dlp listo:', S.bin)
}
const ready = new Promise(r => setTimeout(r, 100)).then(setup).catch(e => { S.err = errMsg(e); console.error('❌ yt-dlp:', S.err) })

if (process.env.YT_COOKIES) {
  const f = path.join(os.tmpdir(), 'yt-cookies.txt')
  fs.writeFileSync(f, process.env.YT_COOKIES)
  S.cookies = ['--cookies', f]
}

async function fetchJson(u, ms = 6000, opts = {}) {
  const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(ms), headers: { 'User-Agent': UA, ...(opts.headers || {}) } })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

function ytdlpLines(args, ms = 40000) {
  return new Promise((resolve, reject) => {
    if (S.err) return reject(new Error(S.err))
    const p = spawn(S.bin, ['--no-warnings', '--flat-playlist', '--dump-json', ...S.js, ...S.cookies, ...args])
    let out = '', err = ''
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('yt-dlp tardó demasiado')) }, ms)
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err = (err + d).slice(-1500)))
    p.on('error', e => { clearTimeout(t); reject(e) })
    p.on('close', code => {
      clearTimeout(t)
      const rows = out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      if (rows.length) return resolve(rows)
      reject(new Error(err.trim().split('\n').pop() || 'yt-dlp falló (' + code + ')'))
    })
  })
}

function startYtdlp(url, fmt, extra = []) {
  return new Promise((resolve, reject) => {
    if (S.err) return reject(new Error(S.err))
    const args = ['--no-playlist', '--no-warnings', '-q', '--max-filesize', '30M', ...S.js, ...extra,
      '-f', fmt, '-o', '-', ...S.cookies, '--', url]
    const p = spawn(S.bin, args)
    let err = '', got = false
    const t = setTimeout(() => p.kill('SIGKILL'), 15000)
    p.stdout.once('data', chunk => { got = true; clearTimeout(t); p.stdout.pause(); resolve({ p, first: chunk }) })
    p.stderr.on('data', d => (err = (err + d).slice(-1500)))
    p.on('error', e => { clearTimeout(t); reject(e) })
    p.on('close', code => {
      clearTimeout(t)
      if (!got) reject(new Error(err.trim().split('\n').pop() || 'yt-dlp falló (' + code + ')'))
    })
  })
}

async function openHttp(u) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 15000)
  try {
    const r = await fetch(u, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': UA } })
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status)
    const ct = r.headers.get('content-type') || ''
    if (!/audio|video|octet-stream/.test(ct)) throw new Error('no es audio (' + ct.slice(0, 30) + ')')
    return { r, ac }
  } finally { clearTimeout(t) }
}

module.exports = { S, ready, errMsg, host, fetchJson, ytdlpLines, startYtdlp, openHttp, INVIDIOUS, PIPED, CLIENTS, UA }
