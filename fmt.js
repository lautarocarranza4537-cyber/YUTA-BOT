const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const clean = s => String(s == null ? '' : s).replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()

function fmtDur(s) {
  s = Math.round(Number(s) || 0)
  if (!s) return ''
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0') : m + ':' + String(x).padStart(2, '0')
}
function fmtViews(n) {
  n = Number(n)
  if (!Number.isFinite(n) || n < 0) return ''
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function toDate(d) {
  if (!d) return null
  if (d instanceof Date) return isNaN(d) ? null : d
  if (typeof d === 'number') return new Date(d < 1e12 ? d * 1000 : d)
  const s = String(d).trim()
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s) || /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const t = Date.parse(s)
  return isNaN(t) ? null : new Date(t)
}
function ago(d) {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 1) return 'hoy'
  if (days < 30) return 'hace ' + days + (days === 1 ? ' día' : ' días')
  if (days < 365) { const m = Math.floor(days / 30); return 'hace ' + m + (m === 1 ? ' mes' : ' meses') }
  const y = Math.floor(days / 365)
  return 'hace ' + y + (y === 1 ? ' año' : ' años')
}
function fmtDate(d) {
  const x = toDate(d)
  if (!x) return typeof d === 'string' ? clean(d).slice(0, 40) : ''
  return x.getUTCDate() + ' de ' + MESES[x.getUTCMonth()] + ' de ' + x.getUTCFullYear() + ' (' + ago(x) + ')'
}
function card(o) {
  const lines = []
  if (o.by) lines.push('👤 *Canal:* ' + clean(o.by).slice(0, 60))
  const d = typeof o.dur === 'string' && o.dur.includes(':') ? o.dur : fmtDur(o.dur)
  if (d) lines.push('⏱️ *Duración:* ' + d)
  const v = fmtViews(o.views)
  if (v) lines.push('👁️ *Vistas:* ' + v)
  if (o.link) lines.push('🔗 *Link:* ' + o.link)
  const dt = fmtDate(o.date)
  if (dt) lines.push('📅 *Lanzado:* ' + dt)
  return (o.icon || '🎵') + ' *' + (clean(o.title).slice(0, 120) || 'Sin título') + '*' + (lines.length ? '\n\n' + lines.join('\n') : '') + (o.note ? '\n\n' + o.note : '')
}
module.exports = { fmtDur, fmtViews, fmtDate, card, clean }
