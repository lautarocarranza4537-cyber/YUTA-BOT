const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile, spawnSync } = require('child_process')

const SITE = process.env.PUBLIC_URL || 'https://yuta-bot-x9pg.onrender.com'
const DEFAULT_NAME = 'YUTA PLAY'
const ORDER = ['General', 'Música', 'Descargas', 'Grupo', 'Anime', 'Juegos', 'Herramientas', 'Owner']
const started = Date.now()

const num = j => String(j || '').split('@')[0].split(':')[0]
const pick = a => a[Math.floor(Math.random() * a.length)]
const rnd = () => Math.floor(Math.random() * 101)
const durSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)
const uptime = () => { const s = Math.floor((Date.now() - started) / 1000); return Math.floor(s / 3600) + 'h ' + (Math.floor(s / 60) % 60) + 'm ' + (s % 60) + 's' }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const unwrap = m => { const c = m.message; return (c && c.ephemeralMessage && c.ephemeralMessage.message) || (c && c.viewOnceMessage && c.viewOnceMessage.message) || c }
const getBody = m => { const c = unwrap(m); return (c && (c.conversation || (c.extendedTextMessage && c.extendedTextMessage.text) || (c.imageMessage && c.imageMessage.caption) || (c.videoMessage && c.videoMessage.caption))) || '' }
const getCtx = m => { const c = unwrap(m); const x = c && Object.values(c).find(v => v && typeof v === 'object' && v.contextInfo); return (x && x.contextInfo) || {} }

// ───── ffmpeg ─────
let FF
function ffbin() {
  if (FF !== undefined) return FF
  FF = null
  try { if (spawnSync('ffmpeg', ['-version']).status === 0) FF = 'ffmpeg' } catch {}
  if (!FF) { try { FF = require('ffmpeg-static') } catch {} }
  console.log('🎞️ ffmpeg:', FF || 'no disponible')
  return FF
}
const tmp = ext => path.join(os.tmpdir(), 'yw_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext)
const rm = (...f) => f.forEach(x => fs.unlink(x, () => {}))
function ff(args, ms = 90000) {
  return new Promise((res, rej) => {
    const bin = ffbin()
    if (!bin) return rej(new Error('ffmpeg no disponible'))
    execFile(bin, ['-y', '-v', 'error', ...args], { timeout: ms, maxBuffer: 1024 * 1024 * 8 }, (e, so, se) =>
      e ? rej(new Error(String(se || e.message).split('\n').filter(Boolean).slice(-1)[0] || 'ffmpeg falló')) : res())
  })
}
async function convert(buf, inExt, outExt, args, ms) {
  const inp = tmp(inExt), out = tmp(outExt)
  fs.writeFileSync(inp, buf)
  try { await ff(['-i', inp, ...args, out], ms); return fs.readFileSync(out) } finally { rm(inp, out) }
}
const toMp3 = buf => convert(buf, 'm4a', 'mp3', ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-compression_level', '9'])
const toOpus = buf => convert(buf, 'mp3', 'ogg', ['-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg'])
const gifToMp4 = buf => convert(buf, 'gif', 'mp4', ['-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an'])

async function toWebp(buf, isVideo, ext) {
  const base = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0'
  const mk = (q, fps) => ['-vf', isVideo ? base + ',fps=' + fps : base, ...(isVideo ? ['-t', '8'] : []), '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(q), '-compression_level', '4', '-loop', '0', '-an']
  let out = await convert(buf, ext, 'webp', mk(50, 12))
  if (isVideo && out.length > 950 * 1024) out = await convert(buf, ext, 'webp', mk(30, 10))
  return out
}
async function addExif(webp, pack, author) {
  try {
    const wp = require('node-webpmux')
    const img = new wp.Image()
    await img.load(webp)
    const json = { 'sticker-pack-id': 'yuta-' + Date.now(), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['✨'] }
    const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jb = Buffer.from(JSON.stringify(json), 'utf8')
    const exif = Buffer.concat([head, jb])
    exif.writeUIntLE(jb.length, 14, 4)
    img.exif = exif
    return await img.save(null)
  } catch (e) { console.log('⚠ sticker sin metadatos:', e.message); return webp }
}

// ───── TTS (voz de Google) ─────
const LANGS = new Set(['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko', 'ru', 'ar', 'hi', 'id', 'tr', 'nl', 'pl', 'ca'])
function splitText(t, max = 180) {
  const out = []
  let cur = ''
  for (const w of t.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w.slice(0, max) } else cur = (cur + ' ' + w).trim()
  }
  if (cur) out.push(cur)
  return out
}
async function googleTTS(text, lang) {
  const parts = splitText(text)
  const bufs = []
  for (let i = 0; i < parts.length; i++) {
    const u = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + lang + '&q=' + encodeURIComponent(parts[i]) + '&total=' + parts.length + '&idx=' + i + '&textlen=' + parts[i].length
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Chrome/120 Mobile Safari/537.36', Referer: 'https://translate.google.com/' }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) throw new Error('Google respondió ' + r.status)
    bufs.push(Buffer.from(await r.arrayBuffer()))
  }
  return Buffer.concat(bufs)
}

// ───── datos y personalización por cuenta ─────
const dirOf = phone => path.join(__dirname, 'sessions', phone)
const bannerFile = phone => path.join(dirOf(phone), 'banner.jpg')
const dbFile = phone => path.join(dirOf(phone), 'bot.json')
const dbs = new Map()
function dbOf(phone) {
  if (!dbs.has(phone)) {
    let d = { mode: 'public', groups: {} }
    try { d = { ...d, ...JSON.parse(fs.readFileSync(dbFile(phone), 'utf8')) } } catch {}
    dbs.set(phone, d)
  }
  return dbs.get(phone)
}
const saveDb = phone => { try { fs.writeFileSync(dbFile(phone), JSON.stringify(dbs.get(phone))) } catch {} }
const grp = (phone, id) => (dbOf(phone).groups[id] ??= { on: false, welcome: false, antilink: false })
const botName = phone => dbOf(phone).name || DEFAULT_NAME
const cleanName = s => String(s || '').replace(/[\u0000-\u001f*_~`\\<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24)
function setPrefs(phone, p) {
  try {
    fs.mkdirSync(dirOf(phone), { recursive: true })
    const d = dbOf(phone)
    if (p && p.name) d.name = p.name
    if (p && p.banner) fs.writeFileSync(bannerFile(phone), p.banner)
    saveDb(phone)
  } catch (e) { console.log('⚠ no pude guardar la personalización:', e.message) }
}
const forget = phone => { dbs.delete(phone) }

// ───── grupos ─────
const metaCache = new Map()
async function getMeta(sock, chat, phone) {
  const key = phone + chat
  const hit = metaCache.get(key)
  if (hit && Date.now() - hit.t < 60000) return hit.m
  try {
    const m = await Promise.race([sock.groupMetadata(chat), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))])
    metaCache.set(key, { t: Date.now(), m })
    if (metaCache.size > 100) metaCache.delete(metaCache.keys().next().value)
    return m
  } catch { return hit ? hit.m : null }
}
const idsOf = p => [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean)
const isAdmin = (meta, jid) => !!(meta && jid && meta.participants.some(p => p.admin && idsOf(p).some(x => num(x) === num(jid))))
const botAdmin = (sock, meta) => [sock.user && sock.user.id, sock.user && sock.user.lid].filter(Boolean).some(j => isAdmin(meta, j))

// ───── registro de comandos y cola ─────
const commands = {}
const add = (names, cat, desc, opts, run) => {
  if (typeof opts === 'function') { run = opts; opts = {} }
  const c = { names, cat, desc, ...opts, run }
  names.forEach(n => (commands[n] = c))
}
const list = () => [...new Set(Object.values(commands))].map(c => ({ name: c.names[0], aliases: c.names.slice(1), cat: c.cat, desc: c.desc, usage: c.usage || '', react: !!c.react }))

let chain = Promise.resolve(), pend = 0
const enqueue = fn => { pend++; const p = chain.then(fn); chain = p.catch(() => {}).then(() => { pend-- }); return p }
const pending = () => pend

async function nekos(cat) {
  const r = await fetch('https://nekos.best/api/v2/' + cat, { signal: AbortSignal.timeout(8000) })
  return (await r.json()).results[0].url
}

module.exports = {
  SITE, DEFAULT_NAME, ORDER, num, pick, rnd, durSec, uptime, norm, unwrap, getBody, getCtx,
  convert, toMp3, toOpus, gifToMp4, toWebp, addExif, LANGS, googleTTS,
  dirOf, bannerFile, dbOf, saveDb, grp, botName, cleanName, setPrefs, forget,
  getMeta, isAdmin, botAdmin, commands, add, list, enqueue, pending, nekos
}
