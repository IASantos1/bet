const http = async (url, opts = {}, jar = {}) => {
  const o = { ...opts }
  o.headers = { 'content-type': 'application/json', ...(o.headers || {}) }
  if (jar.cookie) o.headers.Cookie = jar.cookie
  const res = await fetch(url, o)
  const set = res.headers.get('set-cookie')
  if (set) jar.cookie = String(set).split(';')[0]
  let body = null
  const txt = await res.text()
  try { body = JSON.parse(txt) } catch { body = txt }
  return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()) }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const run = async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:8787'
  const TOKEN = process.env.ADMIN_TOKEN || 'local-dev-admin'
  console.log('TOKEN=', TOKEN)
  const admin = {}
  const user = {}
  console.log('create admin')
  let r = await http(base + '/api/dev/create-admin-user', { method: 'POST' }, admin)
  console.log('admin create', r.status, r.body)
  if (r.status !== 200) throw new Error('create admin failed ' + r.status)
  console.log('admin me')
  r = await http(base + '/api/auth/me', { method: 'GET' }, admin)
  console.log('admin me', r.status, r.body)
  console.log('create user')
  r = await http(base + '/api/dev/create-test-user', { method: 'POST' }, user)
  if (r.status !== 200) throw new Error('create user failed ' + r.status)
  console.log('signin user')
  r = await http(base + '/api/auth/signin', { method: 'POST', body: JSON.stringify({ username: 'teste', password: 'teste123' }) }, user)
  if (r.status !== 200) throw new Error('signin failed ' + r.status)

  console.log('get me')
  r = await http(base + '/api/auth/me', { method: 'GET' }, user)
  console.log('me', r.status, r.body)
  if (r.status !== 200) throw new Error('me failed ' + r.status)
  const uid = r.body?.user?.userId || r.body?.user?.id || r.body?.id
  if (!uid) throw new Error('uid not found')

  console.log('submit IBAN doc')
  const doc = {
    type: 'iban_proof',
    filename: 'iban.pdf',
    mime_type: 'application/pdf',
    size: 2048,
    content_base64: 'dGVzdA==',
    metadata: { iban: 'PT50000201231234567890154' }
  }
  r = await http(base + '/api/users/kyc/documents', { method: 'POST', headers: { Origin: base }, body: JSON.stringify(doc) }, user)
  if (r.status !== 200) throw new Error('submit doc failed ' + r.status)
  const docId = r.body?.id
  console.log('approve doc')
  r = await http(base + `/api/admin/kyc/documents/${docId}/status`, { method: 'POST', headers: { Origin: base, Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ status: 'verified' }) }, admin)
  if (r.status !== 200) throw new Error('approve doc failed ' + r.status)

  console.log('user KYC approved via document')
  if (TOKEN) {
    const approveUser = await http(base + `/api/admin/kyc/approve?uid=${uid}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }, admin)
    console.log('approve user via token', approveUser.status)
    const approveUserQ = await http(base + `/api/admin/kyc/approve?auth=${TOKEN}&uid=${uid}`, { method: 'POST' }, admin)
    console.log('approve user via query', approveUserQ.status)
  }

  console.log('dev credit wallet')
  r = await http(base + '/api/wallet/dev/credit', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ amount_eur: 50, uid }) }, admin)
  if (r.status !== 200) throw new Error('dev credit failed ' + r.status)
  console.log('balance', r.body?.balance)

  console.log('ensure user session before bet')
  let me2 = await http(base + '/api/auth/me', { method: 'GET' }, user)
  console.log('me pre-bet', me2.status, me2.body)
  if (me2.status !== 200) {
    console.log('re-signin user')
    const si = await http(base + '/api/auth/signin', { method: 'POST', body: JSON.stringify({ username: 'teste', password: 'teste123' }) }, user)
    console.log('signin res', si.status, si.body)
  }

  console.log('create event')
  r = await http(base + '/api/events/upsert', { method: 'POST', body: JSON.stringify({ match: 'Casa vs Fora', league: 'Liga Teste', home_team: 'Casa', away_team: 'Fora', home_odd: 2.0, draw_odd: 3.1, away_odd: 3.4, is_live: 0 }) }, admin)
  if (r.status !== 200 && r.status !== 201) throw new Error('upsert event failed ' + r.status)
  const evId = r.body?.id || r.body?.event_id || r.body?.event?.id || r.body?.id
  if (!evId) {
    const ev = await http(base + '/api/events/upsert', { method: 'POST', body: JSON.stringify({ home_team: 'Casa', away_team: 'Fora', home_odd: 2.0, draw_odd: 3.1, away_odd: 3.4, is_live: 0 }) }, admin)
    if (ev.status !== 200 && ev.status !== 201) throw new Error('upsert event2 failed ' + ev.status)
    r = ev
  }
  const eventId = r.body?.id
  if (!eventId) throw new Error('event id not found')

  console.log('place bet')
  r = await http(base + '/api/bets', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ event_id: eventId, selection: 'Casa', odd: 2.0, stake: 20, uid }) }, user)
  console.log('bet resp', r.status, r.body)
  if (r.status !== 201) throw new Error('bet failed ' + r.status)
  const betId = r.body?.id

  console.log('lower odds')
  await delay(1000)
  r = await http(base + '/api/events/upsert', { method: 'POST', body: JSON.stringify({ match: 'Casa vs Fora', league: 'Liga Teste', home_team: 'Casa', away_team: 'Fora', home_odd: 1.6, draw_odd: 3.3, away_odd: 3.8, is_live: 0 }) }, admin)
  if (r.status !== 200 && r.status !== 201) throw new Error('upsert event update failed ' + r.status)
  const oddsCheck = await http(base + `/api/events/${eventId}/odds`, { method: 'GET' })
  console.log('oddsCheck', oddsCheck.status, oddsCheck.body?.markets?.h2h)

  console.log('cashout attempt')
  r = await http(base + `/api/bets/${betId}/cashout`, { method: 'GET' }, user)
  console.log('cashout', r.status, r.body)

  console.log('dev withdraw')
  r = await http(base + '/api/wallet/dev/withdraw', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ uid, amount_eur: 15, iban: 'PT50000201231234567890154', holder_name: 'Teste Teste', nif: '123456789' }) }, user)
  console.log('withdraw', r.status, r.body)

  console.log('done')
}

run().catch((e) => { console.error(e); process.exit(1) })
