import test from 'node:test';
import assert from 'node:assert/strict';
import { readableName, readableTeam } from '../server/teamnames.js';
import { normalizeItem } from '../server/winhouse.js';

test('team names in Chinese characters: the club we know, else in Latin letters', () => {
  assert.equal(readableTeam('广东宏远', 'basquetebol'), 'Guangdong Southern Tigers');
  assert.equal(readableTeam('北京控股', 'basquetebol'), 'Beijing Royal Fighters');
  assert.equal(readableTeam('浙江稠州金租', 'basquetebol'), 'Zhejiang Golden Bulls');
  assert.equal(readableTeam('广东女篮', 'basquetebol'), 'Guangdong Southern Tigers (F)');
  assert.equal(readableTeam('上海海港', 'futebol'), 'Shanghai Port');
  assert.equal(readableTeam('山东泰山U21', 'futebol'), 'Shandong Taishan U21');
  // Unknown: pinyin, two characters a word (three for the first when the count is odd).
  assert.equal(readableTeam('石家庄功夫', 'futebol'), 'Shijiazhuang Gongfu');
  assert.equal(readableTeam('广东宏远', 'voleibol'), 'Guangdong Hongyuan');
  assert.equal(readableTeam('Los Angeles Lakers', 'basquetebol'), 'Los Angeles Lakers');
  assert.equal(readableName('中国男子篮球职业联赛'), 'Zhongguo Nanzi Lanqiu Zhiye Liansai');
  assert.equal(readableName('China. CBA'), 'China. CBA');
});

test('the feed stores those names in Latin letters', () => {
  const ev = normalizeItem({ id: 1, sport_id: 2, league: 'China. CBA', name: '广东宏远 - 辽宁本钢', home_team: '广东宏远', away_team: '辽宁本钢', game_date: '2026-10-27', game_time: '12:00:00' });
  assert.deepEqual([ev.home, ev.away], ['Guangdong Southern Tigers', 'Liaoning Flying Leopards']);
});

test('long team names are shown short; the full name stays in the data', async () => {
  const { shortTeam } = await import('../server/shortnames.js');
  assert.equal(shortTeam('Sporting Clube de Portugal'), 'Sporting CP');
  assert.equal(shortTeam('Paris Saint-Germain'), 'Paris SG');
  assert.equal(shortTeam('Manchester United'), 'Man United');
  assert.equal(shortTeam('FC Bayern München'), 'Bayern');
  // Any other long name: the club-type words to letters, common words short, the marks kept.
  assert.equal(shortTeam('Club Atlético Lanús'), 'CA Lanús');
  assert.equal(shortTeam('Esporte Clube Vitória'), 'EC Vitória');
  assert.equal(shortTeam('Borussia Mönchengladbach II'), "M'gladbach II");
  assert.equal(shortTeam('Clube de Regatas Vasco da Gama'), 'Vasco da Gama');
  assert.equal(shortTeam('Juventude Esporte Clube'), 'Juventude EC');
  assert.equal(shortTeam('Associazione Calcio Fiorentina'), 'AC Fiorentina');
  assert.equal(shortTeam('Real Club Deportivo de La Coruña'), 'RCD La Coruña');
  assert.equal(shortTeam('Universidad Católica'), 'U. Católica');
  assert.equal(shortTeam('TSG 1899 Hoffenheim'), 'Hoffenheim');
  assert.equal(shortTeam('Peterborough United'), 'Peterborough Utd');
  assert.equal(shortTeam('Club Atlético Tigre U20'), 'CA Tigre U20');
  assert.equal(shortTeam('Sociedade Esportiva Palmeiras (F)'), 'Palmeiras (F)');
  assert.equal(shortTeam('Sociedade Esportiva Matsubara (F)'), 'SE Matsubara (F)');
  assert.equal(shortTeam('Golden State Warriors', 'basquetebol'), null);
  assert.equal(shortTeam('Alejandro Davidovich Fokina', 'tenis'), 'A. Davidovich Fokina');
  assert.equal(shortTeam('Carlos Alcaraz', 'tenis'), null);
  assert.equal(shortTeam('Arsenal'), null);
  assert.equal(shortTeam('Sporting CP'), null);
});
