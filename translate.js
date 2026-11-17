const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const FOREIGN = /[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Greek}]/u
const isForeign = s => FOREIGN.test(String(s || '').replace(/\p{Extended_Pictographic}/gu, ''))

// Traduce al español con el traductor gratuito de Google
async function toSpanish(text) {
  const t = String(text || '').trim().slice(0, 300)
  if (!t) return ''
  try {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=' + encodeURIComponent(t), {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json()
    const out = (j[0] || []).map(x => x && x[0]).filter(Boolean).join('').trim()
    if (out && !isForeign(out)) return out
  } catch (e) { console.log('⚠ traducción →', e.message) }
  return isForeign(t) ? '' : t
}
module.exports = { toSpanish, isForeign }
