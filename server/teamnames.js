// Team and league names WinHouse sends in Chinese characters (Chinese basketball, football…): the
// club's usual name when we know it, else the name in Latin letters (pinyin), so a player can tell who
// is playing. Names in any other script are kept as they come.
import { pinyin } from 'pinyin-pro';

const HAN = /[㐀-鿿]/;

// Each list: a part of the Chinese name → the club's name. More specific parts first.
const BASKETBALL = [
  ['北京控股', 'Beijing Royal Fighters'], ['北控', 'Beijing Royal Fighters'], ['北京首钢', 'Beijing Ducks'], ['首钢', 'Beijing Ducks'],
  ['北京', 'Beijing Ducks'], ['广厦', 'Zhejiang Lions'], ['稠州', 'Zhejiang Golden Bulls'], ['金牛', 'Zhejiang Golden Bulls'],
  ['浙江', 'Zhejiang Lions'], ['广东', 'Guangdong Southern Tigers'], ['辽宁', 'Liaoning Flying Leopards'], ['上海', 'Shanghai Sharks'],
  ['新疆', 'Xinjiang Flying Tigers'], ['深圳', 'Shenzhen Leopards'], ['山东', 'Shandong Heroes'], ['广州', 'Guangzhou Loong Lions'],
  ['福建', 'Fujian Sturgeons'], ['江苏', 'Jiangsu Dragons'], ['山西', 'Shanxi Loongs'], ['天津', 'Tianjin Pioneers'],
  ['青岛', 'Qingdao Eagles'], ['四川', 'Sichuan Blue Whales'], ['吉林', 'Jilin Northeast Tigers'], ['同曦', 'Nanjing Monkey Kings'],
  ['南京', 'Nanjing Monkey Kings'], ['宁波', 'Ningbo Rockets'],
];
const FOOTBALL = [
  ['上海海港', 'Shanghai Port'], ['海港', 'Shanghai Port'], ['上海申花', 'Shanghai Shenhua'], ['申花', 'Shanghai Shenhua'],
  ['山东泰山', 'Shandong Taishan'], ['泰山', 'Shandong Taishan'], ['北京国安', 'Beijing Guoan'], ['国安', 'Beijing Guoan'],
  ['成都蓉城', 'Chengdu Rongcheng'], ['蓉城', 'Chengdu Rongcheng'], ['天津津门虎', 'Tianjin Jinmen Tiger'], ['津门虎', 'Tianjin Jinmen Tiger'],
  ['浙江', 'Zhejiang FC'], ['河南', 'Henan FC'], ['武汉三镇', 'Wuhan Three Towns'], ['长春亚泰', 'Changchun Yatai'],
  ['青岛海牛', 'Qingdao Hainiu'], ['青岛西海岸', 'Qingdao West Coast'], ['深圳新鹏城', 'Shenzhen Peng City'], ['梅州客家', 'Meizhou Hakka'],
  ['沧州雄狮', 'Cangzhou Mighty Lions'], ['南通支云', 'Nantong Zhiyun'], ['云南玉昆', 'Yunnan Yukun'], ['大连英博', 'Dalian Yingbo'],
];
const KNOWN = { basquetebol: BASKETBALL, futebol: FOOTBALL };
// Words that mark a side: women's, youth teams.
const SIDES = [['女', ' (F)'], ['预备', ' (Reservas)']];

/** Chinese characters → pinyin, two characters to a word ("广东宏远" → "Guangdong Hongyuan"); other text kept. */
function latin(text) {
  return text.replace(/[㐀-鿿]+/g, (run) => {
    const syl = pinyin(run, { toneType: 'none', type: 'array' });
    const words = [];
    // An odd count: the first word has three (cities like 石家庄 Shijiazhuang, 哈尔滨 Harbin's Haerbin).
    for (let i = 0; i < syl.length;) { const n = i === 0 && syl.length % 2 ? 3 : 2; words.push(syl.slice(i, i + n).join('')); i += n; }
    return ` ${words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} `;
  }).replace(/\s+/g, ' ').trim();
}

/** A team's name readable in Latin letters: its usual name for clubs we know (by sport), else pinyin. */
export function readableTeam(name, sport) {
  const s = String(name || '').trim();
  if (!HAN.test(s)) return s;
  const hit = (KNOWN[sport] || []).find(([k]) => s.includes(k));
  if (!hit) return latin(s);
  const side = SIDES.filter(([k]) => s.includes(k)).map(([, v]) => v).join('');
  const age = /U\d{2}/.exec(s)?.[0];
  return `${hit[1]}${age ? ` ${age}` : ''}${side}`;
}

/** A league or other name: in Latin letters when it is in Chinese characters. */
export const readableName = (name) => (HAN.test(String(name || '')) ? latin(String(name)) : String(name || ''));
