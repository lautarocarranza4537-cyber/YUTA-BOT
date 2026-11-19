// 40 reacciones en GIF: [comando, categoría de nekos.best, texto con alguien, texto sin nadie]
const REACT = [
  ['hug', 'hug', 'abrazó a', 'abrazó a todos'],
  ['kiss', 'kiss', 'besó a', 'mandó besos a todos'],
  ['pat', 'pat', 'acarició a', 'acarició a todos'],
  ['kill', 'kick', 'mató a', 'quiere matar a alguien'],
  ['coffee', 'happy', 'invitó un café a', 'se toma un café'],
  ['smoke', 'nope', 'se fumó un cigarro con', 'se fuma un cigarro'],
  ['slap', 'slap', 'abofeteó a', 'abofeteó al aire'],
  ['cuddle', 'cuddle', 'acurrucó a', 'quiere acurrucarse'],
  ['poke', 'poke', 'picó a', 'picó a todos'],
  ['cry', 'cry', 'está llorando por', 'está llorando'],
  ['dance', 'dance', 'baila con', 'está bailando'],
  ['bite', 'bite', 'mordió a', 'mordió al aire'],
  ['highfive', 'highfive', 'chocó los cinco con', 'chocó los cinco con todos'],
  ['wave', 'wave', 'saludó a', 'saludó a todos'],
  ['blush', 'blush', 'se sonrojó con', 'se sonrojó'],
  ['laugh', 'laugh', 'se ríe de', 'se ríe'],
  ['smile', 'smile', 'le sonrió a', 'sonríe'],
  ['wink', 'wink', 'le guiñó el ojo a', 'guiñó el ojo'],
  ['punch', 'punch', 'golpeó a', 'golpeó al aire'],
  ['patada', 'kick', 'pateó a', 'pateó al aire'],
  ['tickle', 'tickle', 'le hizo cosquillas a', 'hace cosquillas a todos'],
  ['feed', 'feed', 'le dio de comer a', 'da de comer a todos'],
  ['handhold', 'handhold', 'le agarró la mano a', 'quiere agarrar una mano'],
  ['sleep', 'sleep', 'se durmió con', 'se durmió'],
  ['pout', 'pout', 'hace pucheros con', 'hace pucheros'],
  ['facepalm', 'facepalm', 'se golpeó la cara por', 'se golpeó la cara'],
  ['shrug', 'shrug', 'se encogió de hombros con', 'se encogió de hombros'],
  ['baka', 'baka', 'le dijo baka a', 'dijo baka'],
  ['dab', 'dab', 'hizo un dab con', 'hace un dab'],
  ['yeet', 'yeet', 'lanzó por los aires a', 'hizo yeet'],
  ['run', 'run', 'salió corriendo de', 'sale corriendo'],
  ['angry', 'angry', 'se enojó con', 'está enojado'],
  ['bored', 'bored', 'se aburrió con', 'está aburrido'],
  ['think', 'think', 'piensa en', 'está pensando'],
  ['nod', 'nod', 'asintió a', 'asiente'],
  ['nope', 'nope', 'le dijo que no a', 'dice que no'],
  ['happy', 'happy', 'se alegró con', 'está feliz'],
  ['spin', 'spin', 'giró con', 'da vueltas'],
  ['thumbsup', 'thumbsup', 'le dio like a', 'da like'],
  ['clap', 'clap', 'aplaudió a', 'aplaude']
]

module.exports = H => {
  const { add, num } = H
  const { jidNormalizedUser } = require('@whiskeysockets/baileys')

  // Prueba la categoría pedida y, si no existe, usa una de respaldo
  async function gif(cat) {
    for (const c of [...new Set([cat, 'happy', 'hug'])]) {
      try {
        const r = await fetch('https://nekos.best/api/v2/' + c, { signal: AbortSignal.timeout(8000) })
        if (!r.ok) continue
        const url = (await r.json()).results[0].url
        const g = await fetch(url, { signal: AbortSignal.timeout(20000) })
        if (!g.ok) continue
        return Buffer.from(await g.arrayBuffer())
      } catch {}
    }
    throw new Error('No pude conseguir el GIF ahora mismo. Intenta de nuevo.')
  }

  for (const [name, cat, con, solo] of REACT) {
    add([name], 'Reacciones', 'Reacción ' + name, { react: true, heavy: true, usage: '[@usuario]' }, async c => {
      const me = jidNormalizedUser(c.sender)
      const tg = c.target ? jidNormalizedUser(c.target) : null
      const caption = tg ? '💞 @' + num(me) + ' ' + con + ' @' + num(tg) : '💞 @' + num(me) + ' ' + solo
      const mentions = tg ? [me, tg] : [me]
      const g = await gif(cat)
      let mp4 = null
      try { mp4 = await H.gifToMp4(g) } catch {}
      if (mp4) await c.sock.sendMessage(c.chat, { video: mp4, gifPlayback: true, caption, mentions }, { quoted: c.m })
      else await c.sock.sendMessage(c.chat, { image: g, caption, mentions }, { quoted: c.m })
    })
  }
}
module.exports.REACT = REACT
