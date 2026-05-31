import crypto from 'node:crypto'
const token = crypto.randomBytes(32).toString('hex')
console.log('ADMIN_TOKEN=', token)