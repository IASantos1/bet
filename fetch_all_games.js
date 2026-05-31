const key = '7a473e2c-8844-45b6-937e-1f8bd41fc82c';
const url = `https://spro.agency/api/get_games?key=${key}`;

async function run() {
    console.log('Fetching...');
    try {
        const res = await fetch(url);
        const data = await res.json();
        const keys = Object.keys(data);
        console.log('Total games:', keys.length);
        
        let count = 0;
        for (const k of keys) {
            const val = data[k];
            const meta = ['sport', 'last_updated', 'when', 'type', 'game', 'orig_teams', 'universal_id', 'link', 'id'];
            const potentialBookies = Object.keys(val).filter(x => !meta.includes(x));
            
            if (potentialBookies.length > 0) {
                console.log(`[${k}] has bookies:`, potentialBookies.join(', '));
                count++;
                if (count >= 5) break;
            }
        }
        if (count === 0) console.log('No games with odds found.');
    } catch (e) { console.error(e); }
}
run();
