const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Solo se guardan las huellas (SHA-256) de los tokens, así el repositorio no los muestra
const HASHES = [
  '17c81763356f6a2659a32117926a982167b323ad2f00180c5bcb56aa482695cf',
  'a05ad1aa6841404e933d33a182a05922fd399d3ed2cc572955cae6365881f453',
  'b14b1ef1dab42606a72db26d225194b7a531edf1f61aaf0448d0ade781ce9e49',
  '9618bdb445c55f6fc1672bf4b82769f4834af59e0159891d66175c147e253c4a',
  'c7a72e89f4ef835c3f075556d3f46260e614b23942e31b833179d49a6812149d',
  '47700b2597cf90cb929a54f94d0f42f761ae66ecc0932aac6bdffdaee6906e36',
  '7074d8193e3c9aaf36ad8f4da6181bc21b7b100bdc5268272b8c0c2a1ddd1835',
  '47d72e47138707f91b70073ad920744da02ad6f8c23262df1342352cab614aff',
  'b55c51666cab387e27a07728f3d04fa3a88f621d82e4f5c82226daf355dcc18e',
  '81eac067bc8fee7ba8de35cd5df88be604d1d2270afa02a919b00e7a34910ca2'
]

const FILE = path.join(process.env.TOKENS_DIR || path.join(__dirname, 'sessions'), 'tokens.json')
const norm = t => String(t || '').normalize('NFC').trim().toLowerCase()
const hash = t => crypto.createHash('sha256').update(norm(t)).digest('hex')

// Tokens extra opcionales desde Render (LINK_TOKENS=uno,dos,tres)
const extra = (process.env.LINK_TOKENS || '').split(',').map(norm).filter(Boolean).map(hash)
const ALL = [...new Set([...HASHES, ...extra])]

let used = {}
try { used = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch {}
const save = () => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(used)) } catch {} }

// Devuelve la huella del token si es válido, o null (se comparan todas, sin cortar antes)
function find(token) {
  const h = Buffer.from(hash(token), 'hex')
  let found = null
  for (const x of ALL) {
    if (crypto.timingSafeEqual(h, Buffer.from(x, 'hex'))) found = x
  }
  return found
}
const valid = token => !!find(token)

// Cada token es para un solo número: el primero que lo usa se lo queda
function canUse(token, phone) {
  const h = find(token)
  if (!h) return { ok: false, why: 'Token no registrado' }
  if (used[h] && used[h] !== String(phone)) return { ok: false, why: 'Este token ya lo está usando otro número' }
  return { ok: true, h }
}
function claim(token, phone) {
  const r = canUse(token, phone)
  if (!r.ok) return r
  if (used[r.h] !== String(phone)) { used[r.h] = String(phone); save() }
  return r
}

// Libera el token que usaba ese número (se desvinculó o el código venció)
function release(phone) {
  let n = 0
  for (const h of Object.keys(used)) if (used[h] === String(phone)) { delete used[h]; n++ }
  if (n) save()
  return n
}

module.exports = { release, valid, canUse, claim, total: ALL.length, _norm: norm }
