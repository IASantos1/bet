const http = async (url, opts) => {
  try {
    const r = await fetch(url, opts)
    const t = await r.text()
    return { ok: r.ok, status: r.status, body: t }
  } catch (e) {
    return { ok: false, status: 0, body: String(e && e.message ? e.message : e) }
  }
}

const run = async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:8787'
  const probeHealth = await http(base + '/health', { cache: 'no-store' })
  const isNodeApi = probeHealth.status === 200
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
  for (const t of tests) {
    const r = await http(t.url, { cache: 'no-store' })
    const ok = t.expect.includes(r.status)
    const line = `${t.name} ${r.status} ${ok ? 'OK' : 'FAIL'}`
    console.log(line)
    if (!ok) {
      fails++
      console.log(r.body.slice(0, 200))
    }
  }
  if (fails > 0) process.exit(1)
}

run()
