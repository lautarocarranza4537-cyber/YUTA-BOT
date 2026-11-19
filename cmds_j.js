const fs = require('fs')

module.exports = H => {
  const { add, commands, ORDER, num, norm, botName, bannerFile, nekos } = H
  const MAXLEN = 3500

  // Corta un texto largo en mensajes de hasta 3500 caracteres, siempre entre bloques
  const chunk = blocks => {
    const out = []
    let cur = ''
    for (const b of blocks) {
      if (cur && (cur + '\n\n' + b).length > MAXLEN) { out.push(cur); cur = b } else cur = cur ? cur + '\n\n' + b : b
    }
    if (cur) out.push(cur)
    return out
  }

  add(['menu', 'help', 'ayuda', 'comandos'], 'General', 'Muestra todos los comandos disponibles', { usage: '[categoría]' }, async c => {
    const p = c.prefix
    const name = botName(c.phone)
    // Solo lo que esta persona puede usar aquí: los del dueño solo para el dueño, los de grupo solo dentro de un grupo
    const visible = x => !(x.owner && !c.fromMe) && !(x.group && !c.isGroup)
    const all = [...new Set(Object.values(commands))]
    const hiddenByGroup = !c.isGroup && all.some(x => x.group && !(x.owner && !c.fromMe))
    const cats = {}
    for (const x of all) if (visible(x)) (cats[x.cat] ??= []).push(x)
    const keys = ORDER.filter(k => cats[k]).concat(Object.keys(cats).filter(k => !ORDER.includes(k)))
    const total = keys.reduce((n, k) => n + cats[k].length, 0)

    // Detalle de una categoría: nombre, cómo se usa y para qué sirve
    const f = norm(c.args[0])
    if (f) {
      const k = keys.find(x => norm(x) === f)
      if (!k) return c.reply('No existe esa categoría.\n*Categorías:* ' + keys.join(', '))
      const blocks = ['*' + name + '* · ' + k + ' (' + cats[k].length + ')']
      for (const x of cats[k]) blocks.push('`' + p + x.names[0] + '`' + (x.usage ? ' _' + x.usage + '_' : '') + '\n' + x.desc)
      for (const t of chunk(blocks)) await c.reply(t)
      return
    }

    // Menú completo: portada y, debajo, todos los comandos por categoría
    let head = '*' + name + '*\nHola @' + num(c.sender) + '\n\n› *' + total + '* comandos disponibles\n› Prefijos: `.` `,`\n\nAbajo están todos. Para ver qué hace cada uno:\n`' + p + 'menu <categoría>`\nEj: `' + p + 'menu ' + norm(keys[1] || 'musica') + '`'
    let image = null
    const bf = bannerFile(c.phone)
    if (fs.existsSync(bf)) { try { image = fs.readFileSync(bf) } catch {} }
    if (!image) { try { image = { url: await nekos('waifu') } } catch {} }
    if (image) await c.sock.sendMessage(c.chat, { image, caption: head, mentions: [c.sender] }, { quoted: c.m })
    else await c.reply(head, [c.sender])

    const blocks = keys.map(k => '*' + k + '* _(' + cats[k].length + ')_\n' + cats[k].map(x => '`' + p + x.names[0] + '`').join('  '))
    if (hiddenByGroup) blocks.push('_Los comandos de grupo aparecen al usar el menú dentro de un grupo._')
    for (const t of chunk(blocks)) await c.sock.sendMessage(c.chat, { text: t })
  })
}
