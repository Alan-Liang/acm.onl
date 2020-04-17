require('dotenv').config()
const Koa = require('koa')
const YAML = require('yaml')
const { Pool } = require('pg')
const { readFileSync, appendFile: appendFileCb } = require('fs')
const { promisify } = require('util')
const Hashids = require('hashids/cjs')
const appendFile = promisify(appendFileCb)

const { HOST, PORT, HASHID_SALT, VOTE_PREFIX, VOTE_BASE, VOTE_SEARCH, TABLEPREFIX, LINKS, LOGFILE, ERRFILE } = process.env
const links = YAML.parse(readFileSync(LINKS).toString())

const app = new Koa()
app.proxy = true
const pool = new Pool()
const stmt = sql => sql.replace(/PRE_/g, TABLEPREFIX || '')
const hashids = new Hashids(HASHID_SALT, undefined, '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ')
app.use(async (ctx, next) => {
  const start = Date.now()
  try { await next() } catch (e) {
    console.error(e)
    const err = e && e.stack || e
    await appendFile(ERRFILE, `${new Date().toISOString()} ${ctx.path}: ${err}\n`)
    return ctx.status = 500
  } finally {
    const end = new Date()
    await appendFile(LOGFILE, `${ctx.ip} - - [${end.toISOString()}] "${ctx.method} ${ctx.path} HTTP/1.1" ${ctx.status} ${end - start} "${ctx.get('Referrer') || '-'}" "${ctx.get('User-Agent')}"\n`)
  }
})
app.use(async ctx => {
  const { path } = ctx
  try {
    if (path.startsWith(VOTE_PREFIX)) {
      const hashid = path.substring(VOTE_PREFIX.length)
      const id = hashids.decode(hashid)
      if (id.length !== 1) return ctx.status = 404
      const res = await pool.query(stmt('SELECT PRE_users.name AS uname, PRE_forms.name FROM PRE_users, PRE_forms WHERE PRE_forms.id = $1 AND PRE_users.id = PRE_forms.user_id;'), id)
      if (res.rows.length < 1) return ctx.status = 404
      const { uname, name } = res.rows[0]
      return ctx.redirect(`${VOTE_BASE}/${uname}/${name}/fill${VOTE_SEARCH}`)
    }
  } catch (e) { /* empty */ }
  if (path === '' || !path in links) ctx.path = 'keeer'
  ctx.redirect(links[path])
})

app.listen(parseInt(PORT), HOST)
