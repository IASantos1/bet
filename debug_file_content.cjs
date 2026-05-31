const fs = require('fs');
const path = require('path');
const dumpPath = path.join(__dirname, 'payload_dump_platense.txt');
const content = fs.readFileSync(dumpPath, 'utf8');
console.log("--- First 500 chars ---");
console.log(JSON.stringify(content.substring(0, 500)));
console.log("--- Last 100 chars ---");
console.log(JSON.stringify(content.substring(content.length - 100)));
