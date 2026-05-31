const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const http = async (url, opts) => {
  try {
    const headers = { ...(opts && opts.headers ? opts.headers : {}) }
    const tok = process.env.ADMIN_TOKEN
    if (tok) headers['Authorization'] = `Bearer ${tok}`
    const r = await fetch(url, { ...(opts || {}), headers })
    const t = await r.text()
    return { ok: r.ok, status: r.status, body: t }
  } catch (e) {
    return { ok: false, status: 0, body: String(e && e.message ? e.message : e) }
  }
}
const runOnce = async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:8787'
  const sportsEnv = String(process.env.ODDS_SPORTS || '').trim()
  const regionsEnv = String(process.env.ODDS_REGIONS || '').trim()
  const marketsEnv = String(process.env.ODDS_MARKETS || '').trim()
  const updateIntervalMs = Number(process.env.UPDATE_INTERVAL_MS || (15*60*1000))
  const probeHealth = await http(base + '/health', { cache: 'no-store' })
  const isNodeApi = probeHealth.status === 200
  const now = Date.now()
  const lastStr = String(globalThis.__lastOddsUpdateTs || '')
  const lastTs = lastStr ? Number(lastStr) : 0
  if (!isNodeApi && (!Number.isFinite(lastTs) || (now - lastTs) >= updateIntervalMs)) {
    const sports = sportsEnv ? sportsEnv.split(',').map((x) => x.trim()).filter(Boolean) : ['soccer_france_ligue_1','soccer_brazil_campeonato_brasileiro_serie_a']
    try {
      const body = JSON.stringify({ sports, mode: 'all', regions: regionsEnv || undefined, markets: marketsEnv || undefined })
      const r = await http(base + '/api/external/odds/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      const ts = new Date().toISOString()
      console.log(`${ts} update_odds ${r.status} ${r.ok ? 'OK' : 'FAIL'} ${String(r.body||'').slice(0, 200)}`)
    } catch (e) {
      const ts = new Date().toISOString()
      console.error(`${ts} update_odds ERR ${String(e && e.message ? e.message : e)}`)
    }
    globalThis.__lastOddsUpdateTs = String(now)
  }
  const tests = isNodeApi
    ? [
        { name: 'health', url: base + '/health', expect: [200] },
        { name: 'pricing/config', url: base + '/api/pricing/config', expect: [200] },
        { name: 'auth/me', url: base + '/api/auth/me', expect: [200, 401] },
        { name: 'events/by-sport', url: base + '/api/events/by-sport?sports=all&include=odds&markets=full&realtime=0&days=1', expect: [200, 500] },
      ]
    : [
        { name: 'odds/status', url: base + '/api/odds/status', expect: [200] },
        { name: 'metrics/odds', url: base + '/api/metrics/odds', expect: [200, 403, 401] },
        { name: 'metrics/users', url: base + '/api/metrics/users', expect: [200, 403, 401] },
        { name: 'auth/me', url: base + '/api/auth/me', expect: [200, 401] },
      ]
  let fails = 0
  const ts = new Date().toISOString()
  for (const t of tests) {
    const r = await http(t.url, { cache: 'no-store' })
    const ok = t.expect.includes(r.status)
    if (!ok) {
      fails++
      console.error(`${ts} ${t.name} ${r.status} FAIL`)
      console.error(String(r.body || '').slice(0, 200))
    } else {
      console.log(`${ts} ${t.name} ${r.status} OK`)
    }
  }
  return fails
}
const main = async () => {
  const intervalMs = Number(process.env.INTERVAL_MS || 30000)
  for (;;) {
    await runOnce()
    await delay(intervalMs)
  }
}
main()
