
import WebSocket from 'ws';

async function testWS() {
    console.log('Testing WebSocket Connection...');
    const url = 'ws://127.0.0.1:8787/api/live/ws?sport=soccer';
    // const url = 'ws://127.0.0.1:8787/api/ws-echo'; // Alternate echo endpoint

    console.log(`Connecting to ${url}...`);
    const ws = new WebSocket(url);

    ws.on('open', function open() {
        console.log('Connected!');
        ws.send(JSON.stringify({ type: 'subscribe', sport: 'soccer' }));
        
        // Close after 5 seconds if successful
        setTimeout(() => {
            console.log('Closing connection (timeout)...');
            ws.close();
            process.exit(0);
        }, 5000);
    });

    ws.on('message', function message(data) {
        console.log('received: %s', data);
    });

    ws.on('error', function error(err) {
        console.error('WebSocket Error:', err.message);
        process.exit(1);
    });

    ws.on('close', function close(code, reason) {
        console.log(`Disconnected: ${code} ${reason}`);
    });
}

testWS();
