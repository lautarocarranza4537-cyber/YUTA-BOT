const { spawn, spawnSync } = require('child_process')
const C = require('./core')
const { S, ready, errMsg, fetchJson, INVIDIOUS, PIPED } = C

const st = new Map()
const inst = { inv: INVIDIOUS.slice(), pip: PIPED.slice(), at: 0, from: 'lista por defecto' }
const info = { ytdlp: '', upd: '', updAt: 0 }

function rec(name, ok, ms, err) {
  const s = st.get(name) || { ok: 0, fail: 0, streak: 0, ema: 0, last: 0, until: 0, err: '' }
  if (ok) {
    s.ok++; s.streak = 0; s.until = 0; s.last = Date.now(); s.err = ''
    s.ema = s.ema ? s.ema * 0.7 + (ms || 0) * 0.3 : (ms || 0)
  } else {
    s.fail++; s.streak++; s.err = String(err || '').slice(0, 120)
    if (s.streak >= 3) s.until = Date.now() + Math.min(30 * 60000, 60000 * 2 ** (s.streak - 3))
  }
  st.set(name, s)
}

function score(name, base) {
  const s = st.get(name)
  if (!s) return base
  const total = s.ok + s.fail
  const rate = total ? s.ok / total : 0.5
  return base + rate * 100 - (s.ema || 0) / 1000
}
const cooling = name => { const s = st.get(name); return !!(s && s.until > Date.now()) }

// Solo URLs https públicas (evita que una lista externa apunte a la red interna)
function safeUrl(u) {
  try {
    const x = new URL(u)
    if (x.protocol !== 'https:') return null
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(x.hostname)) return null
    return x.origin
  } catch { return null }
}

async function discover() {
  const inv = [], pip = []
  try {
    const arr = await fetchJson('https://api.invidious.io/instances.json?sort_type=health', 8000)
    for (const x of arr) {
      const o = x && x[1]
      const u = o && o.api === true && o.type === 'https' && safeUrl(o.uri)
      if (u && !inv.includes(u)) inv.push(u)
    }
  } catch (e) { console.log('⚠ lista de Invidious →', errMsg(e)) }
  try {
    const arr = await fetchJson('https://piped-instances.kavin.rocks/', 8000)
    for (const x of arr) {
      const u = x && safeUrl(x.api_url)
      if (u && !pip.includes(u)) pip.push(u)
    }
  } catch (e) { console.log('⚠ lista de Piped →', errMsg(e)) }
  const merge = (found, base) => [...new Set(found.slice(0, 3).concat(base))].slice(0, 5)
  if (inv.length || pip.length) {
    inst.inv = merge(inv, INVIDIOUS)
    inst.pip = merge(pip, PIPED)
    inst.from = 'listas públicas actualizadas'
  }
  inst.at = Date.now()
  console.log('🛡️ instancias:', inst.inv.length, 'invidious,', inst.pip.length, 'piped')
}

function readVersion() {
  try { info.ytdlp = String(spawnSync(S.bin, ['--version'], { timeout: 20000 }).stdout || '').trim() } catch {}
}

function updateYtdlp() {
  if (S.err) return
  let out = ''
  const p = spawn(S.bin, ['-U'])
  p.stdout.on('data', d => (out += d))
  p.stderr.on('data', d => (out += d))
  p.on('error', () => {})
  p.on('close', () => {
    info.updAt = Date.now()
    info.upd = out.trim().split('\n').pop().slice(0, 140)
    readVersion()
    console.log('🛡️ yt-dlp:', info.ytdlp, '|', info.upd)
  })
}

function status() {
  const now = Date.now()
  const methods = {}
  for (const [n, s] of st) {
    methods[n] = {
      ok: s.ok, fail: s.fail,
      estado: s.until > now ? 'en pausa ' + Math.ceil((s.until - now) / 60000) + ' min' : 'activo',
      ms: Math.round(s.ema || 0),
      ultimoOk: s.last ? Math.round((now - s.last) / 60000) + ' min' : 'nunca',
      error: s.err
    }
  }
  const recent = pred => [...st].some(([n, s]) => pred(n) && s.last && now - s.last < 45 * 60000)
  let veredicto
  if (recent(n => !/soundcloud/.test(n))) veredicto = 'OK: hay métodos de YouTube funcionando'
  else if (recent(n => /soundcloud/.test(n))) veredicto = 'YouTube parece bloquear este servidor; solo funciona SoundCloud'
  else veredicto = st.size ? 'Ningún método funcionó últimamente' : 'Sin datos todavía (espera el primer chequeo, ~90 s)'
  return {
    veredicto,
    ytdlp: info.ytdlp || S.err || '?',
    ytdlpActualizado: info.updAt ? Math.round((now - info.updAt) / 60000) + ' min' : 'pendiente',
    instancias: { origen: inst.from, invidious: inst.inv, piped: inst.pip },
    metodos: methods
  }
}

ready.then(() => {
  readVersion()
  setTimeout(discover, 3000)
  setInterval(discover, 30 * 60000).unref()
  setTimeout(updateYtdlp, 30000)
  setInterval(updateYtdlp, 12 * 3600000).unref()
})

module.exports = { rec, score, cooling, status, inv: () => inst.inv, pip: () => inst.pip }
