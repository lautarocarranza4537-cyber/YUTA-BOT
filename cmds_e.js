module.exports = H => {
  const { add, num, getLinker, SITE } = H

  add(['code', 'codigo', 'vincular'], 'General', 'Vincula tu WhatsApp con un código de 8 caracteres', { heavy: true }, async c => {
    const link = getLinker()
    if (!link) return c.reply('La vinculación no está disponible en este momento.')
    if (c.isGroup) return c.reply('Por seguridad, pide tu código en un chat *privado* conmigo. Escríbeme al privado y usa `' + c.prefix + 'code`.')
    if (c.fromMe) return c.reply('Ya estás vinculado con este bot. Para vincular a otra persona, pídele que me escriba `' + c.prefix + 'code` desde su WhatsApp.')

    const k = c.m.key
    const jid = [k.remoteJid, k.remoteJidAlt, k.participantAlt].find(j => j && /@s\.whatsapp\.net$/.test(j))
    if (!jid) return c.reply('No pude identificar tu número desde este chat. Vincúlate desde la página:\n' + SITE)
    const phone = num(jid)

    await c.reply('⏳ Generando tu código…')
    let r
    try { r = await link(phone, 'wa:' + phone) } catch (e) { return c.reply('❌ ' + (e.message || 'No pude generar el código.')) }
    if (r.state === 'open') return c.reply('✅ Tu número ya está vinculado.')
    if (r.state !== 'pairing') return c.reply('Tu número ya estaba vinculado y se está reconectando. Espera un momento.')

    await c.reply(
      '*Antes de vincular, sigue estos pasos:*\n\n' +
      '1. Abre WhatsApp en el celular del número *+' + phone + '*.\n' +
      '2. Toca los tres puntos (⋮) o *Ajustes* y entra a *Dispositivos vinculados*.\n' +
      '3. Toca *Vincular un dispositivo*.\n' +
      '4. Elige *Vincular con el número de teléfono* (abajo).\n' +
      '5. Escribe el código de 8 caracteres que te mando en el siguiente mensaje.\n\n' +
      '⏳ El código vence en 3 minutos.\n' +
      '⚠️ Al vincular, el bot podrá leer los mensajes de esa cuenta, como WhatsApp Web. Vincula solo tu propio número.\n\n' +
      'Cuando termine, personaliza tu bot con `' + c.prefix + 'botname` y `' + c.prefix + 'setbanner`.'
    )
    await c.sock.sendMessage(c.chat, { text: '```' + r.code + '```' })
  })
}
