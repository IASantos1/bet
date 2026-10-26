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
