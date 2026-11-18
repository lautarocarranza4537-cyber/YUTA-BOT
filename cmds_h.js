module.exports = H => {
  const { add, num, dbOf, saveDb, pick } = H

  const eco = phone => (dbOf(phone).eco ??= { u: {} })
  const user = (phone, jid) => {
    const u = (eco(phone).u[num(jid)] ??= { cash: 0, bank: 0, t: {}, streak: 0, ld: '', lw: -1, lm: '' })
    u.j = jid
    return u
  }
  const fm = n => Math.round(n).toLocaleString('es-AR')
  const AR = () => new Date(Date.now() - 3 * 3600e3)
  const dayKey = () => AR().toISOString().slice(0, 10)
  const yestKey = () => new Date(Date.now() - 27 * 3600e3).toISOString().slice(0, 10)
  const weekKey = () => Math.floor((Math.floor((Date.now() - 3 * 3600e3) / 86400e3) + 3) / 7)
  const monthKey = () => AR().toISOString().slice(0, 7)
  const toMidnight = () => 86400e3 - ((Date.now() - 3 * 3600e3) % 86400e3)
  const dur = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + 'h ' : '') + (m ? m + 'm ' : '') + (h ? '' : (s % 60) + 's') }
  const wait = (u, key, ms) => { const left = (u.t[key] || 0) + ms - Date.now(); if (left > 0) return left; u.t[key] = Date.now(); return 0 }
  const amt = (arg, max) => { const a = String(arg || '').toLowerCase(); if (a === 'all' || a === 'todo') return max; return /^\d+$/.test(a) ? parseInt(a, 10) : 0 }
  const save = c => saveDb(c.phone)
  const C = '🪙'

  add(['balance', 'bal', 'coins', 'saldo', 'dinero'], 'Economía', 'Muestra tu dinero', { usage: '[@usuario]' }, async c => {
    const t = c.target || c.sender
    const u = user(c.phone, t)
    await c.reply('💰 *Cartera de @' + num(t) + '*\n\n' + C + ' Efectivo: ' + fm(u.cash) + '\n🏦 Banco: ' + fm(u.bank) + '\n📊 Total: ' + fm(u.cash + u.bank), [t])
  })

  add(['daily', 'diario', 'recompensa'], 'Economía', 'Recompensa diaria: sube cada día seguido (se reinicia a las 12 de la noche)', async c => {
    const u = user(c.phone, c.sender), today = dayKey()
    if (u.ld === today) return c.reply('⏳ Ya cobraste hoy. Vuelve en ' + dur(toMidnight()) + '.')
    u.streak = u.ld === yestKey() ? u.streak + 1 : 1
    u.ld = today
    const r = 500 + Math.min(u.streak, 30) * 50
    u.cash += r; save(c)
    await c.reply('🎁 *Recompensa diaria*\n+' + fm(r) + ' ' + C + '\n🔥 Racha: ' + u.streak + ' día' + (u.streak === 1 ? '' : 's'))
  })
  add(['weekly', 'semanal'], 'Economía', 'Tu regalo semanal (se reinicia los lunes)', async c => {
    const u = user(c.phone, c.sender), w = weekKey()
    if (u.lw === w) return c.reply('⏳ Ya cobraste esta semana. Vuelve el lunes.')
    u.lw = w; u.cash += 3000; save(c)
    await c.reply('🎁 *Regalo semanal*\n+3.000 ' + C)
  })
  add(['mensual', 'monthly', 'mes'], 'Economía', 'Tu regalo del mes (se reinicia el día 1)', async c => {
    const u = user(c.phone, c.sender), m = monthKey()
    if (u.lm === m) return c.reply('⏳ Ya cobraste este mes. Vuelve el día 1.')
    u.lm = m; u.cash += 10000; save(c)
    await c.reply('🎁 *Regalo del mes*\n+10.000 ' + C)
  })

  add(['work', 'trabajar', 'w', 'trabajo'], 'Economía', 'Trabaja para ganar dinero (cada 10 minutos)', async c => {
    const u = user(c.phone, c.sender), left = wait(u, 'work', 10 * 60e3)
    if (left) return c.reply('⏳ Estás cansado. Vuelve a trabajar en ' + dur(left) + '.')
    const r = 100 + Math.floor(Math.random() * 301)
    u.cash += r; save(c)
    await c.reply('💼 ' + pick(['Repartiste pedidos', 'Arreglaste computadoras', 'Atendiste una tienda', 'Cuidaste una casa', 'Lavaste autos']) + ' y ganaste *' + fm(r) + '* ' + C)
  })
  add(['crime', 'crimen', 'delito'], 'Economía', 'Arriésgate: ganas bastante o pierdes (cada 15 minutos)', async c => {
    const u = user(c.phone, c.sender), left = wait(u, 'crime', 15 * 60e3)
    if (left) return c.reply('⏳ Hay mucha policía. Vuelve en ' + dur(left) + '.')
    if (Math.random() < 0.55) {
      const r = 300 + Math.floor(Math.random() * 701)
      u.cash += r; save(c)
      return c.reply('🕶️ Salió bien: ganaste *' + fm(r) + '* ' + C)
    }
    const l = Math.min(u.cash, 200 + Math.floor(Math.random() * 401))
    u.cash -= l; save(c)
    await c.reply('🚔 Te atraparon y perdiste *' + fm(l) + '* ' + C)
  })
  add(['rob', 'steal', 'robar', 'asaltar'], 'Economía', 'Róbale el efectivo a alguien (cada 30 minutos)', { usage: '@usuario', group: true, nometa: true }, async c => {
    if (!c.target) return c.reply('Menciona o responde a quien quieres robar.')
    if (num(c.target) === num(c.sender)) return c.reply('No puedes robarte a ti mismo.')
    const u = user(c.phone, c.sender), v = user(c.phone, c.target)
    if (v.cash < 300) return c.reply('Esa persona casi no lleva efectivo, no vale la pena.')
    const left = wait(u, 'rob', 30 * 60e3)
    if (left) return c.reply('⏳ Hay que esperar ' + dur(left) + ' para volver a robar.')
    if (Math.random() < 0.45) {
      const r = Math.max(1, Math.floor(v.cash * (0.1 + Math.random() * 0.2)))
      v.cash -= r; u.cash += r; save(c)
      return c.reply('🥷 Le robaste *' + fm(r) + '* ' + C + ' a @' + num(c.target), [c.target])
    }
    const l = Math.min(u.cash, 150)
    u.cash -= l; save(c)
    await c.reply('🚨 Te pillaron y pagaste *' + fm(l) + '* ' + C + ' de multa.')
  })

  add(['deposit', 'dep', 'depositar', 'd'], 'Economía', 'Guarda dinero en el banco (no se puede robar)', { usage: '<cantidad|all>' }, async c => {
    const u = user(c.phone, c.sender), n = amt(c.args[0], u.cash)
    if (!n) return c.reply('Uso: `' + c.prefix + 'deposit` _500_ o _all_')
    if (n > u.cash) return c.reply('No tienes tanto efectivo.')
    u.cash -= n; u.bank += n; save(c)
    await c.reply('🏦 Depositaste *' + fm(n) + '* ' + C)
  })
  add(['withdraw', 'with', 'retirar', 'sacar'], 'Economía', 'Saca dinero del banco', { usage: '<cantidad|all>' }, async c => {
    const u = user(c.phone, c.sender), n = amt(c.args[0], u.bank)
    if (!n) return c.reply('Uso: `' + c.prefix + 'withdraw` _500_ o _all_')
    if (n > u.bank) return c.reply('No tienes tanto en el banco.')
    u.bank -= n; u.cash += n; save(c)
    await c.reply('💵 Retiraste *' + fm(n) + '* ' + C)
  })
  add(['pay', 'givecoins', 'transferir'], 'Economía', 'Transfiere dinero a otro usuario (del banco y, si falta, de tu efectivo)', { usage: '<cantidad> @usuario' }, async c => {
    if (!c.target) return c.reply('Uso: `' + c.prefix + 'pay` _500_ @usuario')
    if (num(c.target) === num(c.sender)) return c.reply('No puedes pagarte a ti mismo.')
    const u = user(c.phone, c.sender), v = user(c.phone, c.target)
    const n = amt(c.args.find(a => /^(\d+|all|todo)$/i.test(a)), u.bank + u.cash)
    if (!n) return c.reply('Uso: `' + c.prefix + 'pay` _500_ @usuario')
    if (n > u.bank + u.cash) return c.reply('No tienes tanto dinero.')
    const fromBank = Math.min(u.bank, n)
    u.bank -= fromBank; u.cash -= n - fromBank; v.cash += n; save(c)
    await c.reply('✅ Le pasaste *' + fm(n) + '* ' + C + ' a @' + num(c.target), [c.target])
  })
  add(['economyboard', 'eboard', 'baltop', 'ranking', 'top'], 'Economía', 'Ranking de usuarios con más coins', async c => {
    const list = Object.values(eco(c.phone).u).map(u => ({ u, t: u.cash + u.bank })).filter(x => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 10)
    if (!list.length) return c.reply('Todavía nadie tiene coins. Prueba `' + c.prefix + 'daily`.')
    const medals = ['🥇', '🥈', '🥉']
    await c.reply('🏆 *Los más ricos*\n\n' + list.map((x, i) => (medals[i] || (i + 1) + '.') + ' @' + num(x.u.j) + ' — ' + fm(x.t)).join('\n'), list.map(x => x.u.j))
  })

  // ───── apuestas ─────
  const bet = (c, arg) => {
    const u = user(c.phone, c.sender), n = amt(arg, u.cash)
    if (!n) return { err: 'Indica cuánto apostar. Ej: `' + c.prefix + c.names0 + ' 100`' }
    if (n < 10) return { err: 'La apuesta mínima es 10 ' + C }
    if (n > u.cash) return { err: 'No tienes tanto efectivo (tienes ' + fm(u.cash) + ' ' + C + ').' }
    return { u, n }
  }

  add(['coinflip', 'moneda', 'flip', 'cf', 'apostar'], 'Economía', 'Cara o cruz (con una cantidad, apuestas coins)', { usage: '[cantidad] [cara/cruz]' }, async c => {
    const a0 = (c.args[0] || '').toLowerCase()
    if (!/^\d+$/.test(a0) && a0 !== 'all' && a0 !== 'todo') return c.reply('🪙 ' + pick(['Cara', 'Cruz']))
    c.names0 = 'coinflip'
    const b = bet(c, a0)
    if (b.err) return c.reply(b.err)
    const side = /cruz/i.test(c.args[1] || '') ? 'cruz' : 'cara'
    const res = Math.random() < 0.5 ? 'cara' : 'cruz'
    if (res === side) { b.u.cash += b.n; save(c); return c.reply('🪙 Salió *' + res + '*. ¡Ganaste ' + fm(b.n) + ' ' + C + '!') }
    b.u.cash -= b.n; save(c)
    await c.reply('🪙 Salió *' + res + '*. Perdiste ' + fm(b.n) + ' ' + C)
  })

  add(['roulette', 'rt', 'ruleta'], 'Economía', 'Ruleta: rojo y negro pagan x2, verde x14', { usage: '<rojo|negro|verde> <cantidad>' }, async c => {
    const color = c.args.map(a => a.toLowerCase()).map(a => (/^(red|rojo)$/.test(a) ? 'rojo' : /^(black|negro)$/.test(a) ? 'negro' : /^(green|verde)$/.test(a) ? 'verde' : '')).find(Boolean)
    const num2 = c.args.find(a => /^(\d+|all|todo)$/i.test(a))
    c.names0 = 'roulette'
    if (!color) return c.reply('Uso: `' + c.prefix + 'roulette` _rojo_ _100_')
    const b = bet(c, num2)
    if (b.err) return c.reply(b.err)
    const n = Math.floor(Math.random() * 37)
    const res = n === 0 ? 'verde' : n % 2 === 1 ? 'rojo' : 'negro'
    const icon = { rojo: '🔴', negro: '⚫', verde: '🟢' }[res]
    if (res === color) {
      const win = b.n * (color === 'verde' ? 13 : 1)
      b.u.cash += win; save(c)
      return c.reply(icon + ' Salió *' + n + ' ' + res + '*. ¡Ganaste ' + fm(win) + ' ' + C + '!')
    }
    b.u.cash -= b.n; save(c)
    await c.reply(icon + ' Salió *' + n + ' ' + res + '*. Perdiste ' + fm(b.n) + ' ' + C)
  })

  add(['slots', 'tragaperras', 'slot', 'tragamonedas'], 'Economía', 'Tragaperras: tres iguales pagan hasta 50 veces', { usage: '<apuesta>' }, async c => {
    c.names0 = 'slots'
    const b = bet(c, c.args[0])
    if (b.err) return c.reply(b.err)
    const S = [['🍒', 5], ['🍋', 8], ['🍇', 10], ['🔔', 15], ['💎', 25], ['7️⃣', 50]]
    const r = [0, 0, 0].map(() => S[Math.floor(Math.random() * S.length)])
    const line = r.map(x => x[0]).join(' ')
    b.u.cash -= b.n
    let msg
    if (r[0][0] === r[1][0] && r[1][0] === r[2][0]) {
      const win = b.n * r[0][1]
      b.u.cash += win
      msg = '🎉 ¡Tres iguales! Ganaste *' + fm(win) + '* ' + C
    } else if (r[0][0] === r[1][0] || r[1][0] === r[2][0] || r[0][0] === r[2][0]) {
      b.u.cash += b.n
      msg = '😐 Dos iguales: recuperas tu apuesta.'
    } else msg = '😿 Perdiste *' + fm(b.n) + '* ' + C
    save(c)
    await c.reply('🎰 ' + line + '\n\n' + msg)
  })
}
