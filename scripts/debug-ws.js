
import WebSocket from 'ws';

const key = '7a473e2c-8844-45b6-937e-1f8bd41fc82c';
const url = `wss://spro.agency/api?key=${key}`;

console.log(`Connecting to ${url.replace(key, '***')}`);

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('WS Open');
    ws.send(JSON.stringify({ action: 'subscribe', sport: 'soccer' }));
});

ws.on('message', (data) => {
    console.log('WS Message received:', data.toString().substring(0, 100) + '...');
    try {
        const json = JSON.parse(data.toString());
        // console.log('JSON:', JSON.stringify(json, null, 2));
        if (json.action === 'socket_connected') return;
        
        console.log('JSON parsed, is array?', Array.isArray(json));
        if (Array.isArray(json)) {
             console.log('Length:', json.length);
             if (json.length > 0) console.log('First item keys:', Object.keys(json[0]));
             ws.close();
        } else if (json.sport || json.data) {
             console.log('Received update. Action:', json.action);
             if (json.data) {
                console.log('Data sample:', JSON.stringify(json.data, null, 2));
             } else {
                console.log('Root object sample:', JSON.stringify(json, null, 2));
             }
             ws.close();
        }
    } catch (e) {
        console.error('Parse error:', e);
    }
});

ws.on('close', () => {
    console.log('WS Closed');
});

ws.on('error', (e) => {
    console.error('WS Error:', e);
});

setTimeout(() => {
    console.log('Timeout');
    ws.close();
}, 20000);
