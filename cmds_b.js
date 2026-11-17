module.exports = H => {
  const { add, num, grp, saveDb } = H
  const G = { group: true }
  const GA = { group: true, admin: true }
  const GB = { group: true, admin: true, botAdmin: true }

  add(['tagall', 'todos'], 'Grupo', 'Menciona a todos los miembros', { ...GA, usage: '[mensaje]' }, async c => {
    const ids = c.meta.participants.map(p => p.id)
    await c.reply('📢 *' + (c.text || 'Atención') + '*\n\n' + ids.map(i => '› @' + num(i)).join('\n'), ids)
  })
  add(['hidetag', 'notify'], 'Grupo', 'Avisa a todos sin mostrar la lista', { ...GA, usage: '<texto>' }, async c => {
    await c.sock.sendMessage(c.chat, { text: c.text || '📢', mentions: c.meta.participants.map(p => p.id) })
  })
  add(['kick', 'echar'], 'Grupo', 'Expulsa a un miembro', { ...GB, usage: '@usuario' }, async c => {
    if (!c.target) return c.reply('Menciona o responde a alguien.')
    await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'remove')
  })
  add(['add', 'agregar'], 'Grupo', 'Agrega un número al grupo', { ...GB, usage: '<número>' }, async c => {
    const n = (c.args[0] || '').replace(/\D/g, '')
    if (!n) return c.reply('Uso: `' + c.prefix + 'add` _5493510000000_')
    await c.sock.groupParticipantsUpdate(c.chat, [n + '@s.whatsapp.net'], 'add')
  })
  add(['promote', 'daradmin'], 'Grupo', 'Da rol de administrador', { ...GB, usage: '@usuario' }, async c => {
    if (!c.target) return c.reply('Menciona o responde a alguien.')
    await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'promote')
    await c.reply('✅ Ahora es administrador.')
  })
  add(['demote', 'quitaradmin'], 'Grupo', 'Quita el rol de administrador', { ...GB, usage: '@usuario' }, async c => {
    if (!c.target) return c.reply('Menciona o responde a alguien.')
    await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'demote')
    await c.reply('✅ Ya no es administrador.')
  })
  add(['link', 'enlace'], 'Grupo', 'Enlace de invitación del grupo', { ...G, botAdmin: true }, async c => {
    await c.reply('🔗 https://chat.whatsapp.com/' + (await c.sock.groupInviteCode(c.chat)))
  })
  add(['revoke', 'resetlink'], 'Grupo', 'Genera un enlace nuevo e invalida el anterior', GB, async c => {
    await c.sock.groupRevokeInvite(c.chat)
    await c.reply('✅ Enlace restablecido.')
  })
  add(['grupo', 'group'], 'Grupo', 'Abre o cierra el chat para los miembros', { ...GB, usage: 'abrir|cerrar' }, async c => {
    const o = c.args[0]
    if (!['abrir', 'cerrar'].includes(o)) return c.reply('Uso: `' + c.prefix + 'grupo` _abrir_ o _cerrar_')
    await c.sock.groupSettingUpdate(c.chat, o === 'abrir' ? 'not_announcement' : 'announcement')
    await c.reply(o === 'abrir' ? '🔓 Grupo abierto.' : '🔒 Grupo cerrado.')
  })
  add(['setname'], 'Grupo', 'Cambia el nombre del grupo', { ...GB, usage: '<nombre>' }, async c => {
    if (!c.text) return c.reply('Escribe el nuevo nombre.')
    await c.sock.groupUpdateSubject(c.chat, c.text)
  })
  add(['setdesc'], 'Grupo', 'Cambia la descripción del grupo', { ...GB, usage: '<texto>' }, async c => {
    await c.sock.groupUpdateDescription(c.chat, c.text)
  })
  add(['admins'], 'Grupo', 'Lista de administradores', G, async c => {
    const a = c.meta.participants.filter(p => p.admin).map(p => p.id)
    await c.reply('👮 *Administradores*\n' + a.map(i => '› @' + num(i)).join('\n'), a)
  })
  add(['infogrupo', 'groupinfo'], 'Grupo', 'Datos del grupo', G, async c => {
    const m = c.meta
    await c.reply('👥 *' + m.subject + '*\n\n› Miembros: ' + m.participants.length + '\n› Admins: ' + m.participants.filter(p => p.admin).length + '\n› ID: ' + m.id + '\n\n' + (m.desc || 'Sin descripción'))
  })
  add(['del', 'delete'], 'Grupo', 'Borra un mensaje (responde a él)', GB, async c => {
    const x = c.ctx
    if (!x.stanzaId) return c.reply('Responde al mensaje que quieres borrar.')
    await c.sock.sendMessage(c.chat, { delete: { remoteJid: c.chat, fromMe: false, id: x.stanzaId, participant: x.participant } })
  })
  add(['welcome', 'bienvenida'], 'Grupo', 'Activa o desactiva la bienvenida', { ...GA, usage: 'on|off' }, async c => {
    const v = c.args[0]
    if (!['on', 'off'].includes(v)) return c.reply('Uso: `' + c.prefix + 'welcome` _on_ o _off_')
    grp(c.phone, c.chat).welcome = v === 'on'; saveDb(c.phone)
    await c.reply('Bienvenida: ' + v)
  })
  add(['antilink'], 'Grupo', 'Borra enlaces de grupos y expulsa a quien los envíe', { ...GB, usage: 'on|off' }, async c => {
    const v = c.args[0]
    if (!['on', 'off'].includes(v)) return c.reply('Uso: `' + c.prefix + 'antilink` _on_ o _off_')
    grp(c.phone, c.chat).antilink = v === 'on'; saveDb(c.phone)
    await c.reply('Antilink: ' + v)
  })
}
