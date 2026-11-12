const fs = require('fs')
const FILE = './db.json'
let data = { groups: {}, mode: 'public' }
try { data = JSON.parse(fs.readFileSync(FILE)) } catch {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
module.exports = {
  data, save,
  group(id) { return (data.groups[id] ??= { welcome: false, antilink: false }) }
}
