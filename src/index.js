require('dotenv').config()
const Koa = require('koa')
const YAML = require('yaml')
const { readFileSync, appendFile: appendFileCb } = require('fs')
const { promisify } = require('util')
const appendFile = promisify(appendFileCb)

const { HOST, PORT, LINKS, LOGFILE, ERRFILE } = process.env
const links = YAML.parse(readFileSync(LINKS).toString())

const app = new Koa()
app.proxy = true

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

const handlers = {
  '/oj' (path) {
    const OJ_BASE = 'https://acm.sjtu.edu.cn/OnlineJudge/'
    if (!path) return OJ_BASE
    if (/^\d+$/.test(path)) return new URL('problem?problem_id=' + path, OJ_BASE)
    if (/^p\/\d+$/i.test(path)) return new URL('problem?problem_id=' + path.slice(2), OJ_BASE)
    if (/^c\/\d+$/i.test(path)) return new URL('contest?contest_id=' + path.slice(2), OJ_BASE)
    if (/^h\/\d+$/i.test(path)) return new URL('homework?homework_id=' + path.slice(2), OJ_BASE)
    if (/^s\/\d+$/i.test(path)) return new URL('code?submit_id=' + path.slice(2), OJ_BASE)
    return new URL(path, OJ_BASE)
  },
}

app.use(async ctx => {
  const { path } = ctx
  if (path in links) {
    ctx.redirect(links[path])
    return
  }
  for (const prefix of Object.keys(handlers)) {
    if (path.startsWith(prefix + '/') || path === prefix) {
      ctx.redirect(handlers[prefix](path.replace(prefix, '').replace(/^\//, '')))
      return
    }
  }
  ctx.redirect(new URL(path, 'https://acm.sjtu.app'))
})

app.listen(parseInt(PORT), HOST)
