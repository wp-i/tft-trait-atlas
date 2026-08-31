import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://raw.communitydragon.org/latest/cdragon/tft/zh_cn.json';
const ASSET_ROOT = 'https://raw.communitydragon.org/latest/game/';
const projectRoot = process.cwd();

const uniqueTraitNames = new Set([
  '顶级掠食者',
  '月华神女',
  '自然之力！大元素使',
  '赏金猎人',
  '帝王斑蝶',
  '宝石骑士',
  '翠神',
  '魔岩巨兽',
  '远古树精',
  '荆棘之兴',
]);

const hiddenTraitNames = new Set(['日月双蚀']);
const dropOnlyEmblems = new Set(['魔女', '护卫', '绝命花妖', '主宰']);

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/^da_/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const pngPath = (assetPath) => assetPath.replace(/\.tex$/i, '.png').toLowerCase();

async function downloadAsset(assetPath, outputPath) {
  const response = await fetch(`${ASSET_ROOT}${pngPath(assetPath)}`);
  if (!response.ok) {
    throw new Error(`Asset ${response.status}: ${assetPath}`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Data ${response.status}: ${SOURCE}`);
const raw = await response.json();
const set = raw.setData.find((entry) => entry.number === 18 && entry.traits?.length === 36);
if (!set) throw new Error('Set 18 data was not found in CommunityDragon.');

const traits = set.traits
  .filter((trait) => !hiddenTraitNames.has(trait.name))
  .map((trait) => ({
    id: slug(trait.apiName),
    apiName: trait.apiName,
    name: trait.name,
    breakpoints: trait.effects
      .map((effect) => effect.minUnits)
      .filter((units) => Number.isFinite(units)),
    icon: `/tft/traits/${slug(trait.apiName)}.png`,
    unique: uniqueTraitNames.has(trait.name),
  }));

const traitByName = new Map(traits.map((trait) => [trait.name, trait]));

const championCandidates = set.champions.filter(
  (champion) =>
    champion.apiName?.startsWith('DA_') &&
    champion.cost >= 1 &&
    champion.cost <= 5 &&
    champion.traits?.length > 0 &&
    champion.apiName !== 'DA_Lux18_Base',
);

const champions = championCandidates.map((champion) => {
  const isLux = champion.name.startsWith('拉克丝');
  const traitWeights = Object.fromEntries(
    champion.traits
      .filter((name) => traitByName.has(name))
      .map((name) => [name, isLux && !uniqueTraitNames.has(name) ? 2 : 1]),
  );

  return {
    id: slug(champion.apiName),
    apiName: champion.apiName,
    name: champion.name,
    cost: champion.cost,
    traits: champion.traits.filter((name) => traitByName.has(name)),
    traitWeights,
    image: `/tft/champions/${slug(champion.apiName)}.png`,
    group: isLux ? 'lux' : champion.apiName,
  };
});

const emblemItems = raw.items.filter(
  (item) =>
    item.apiName?.startsWith('DA_18_Emblem') &&
    item.name?.endsWith('纹章') &&
    !item.apiName.endsWith('Augment'),
);

const emblems = emblemItems
  .map((item) => {
    const traitName = item.name.replace(/纹章$/, '');
    const trait = traitByName.get(traitName);
    if (!trait) return null;
    return {
      id: trait.id,
      name: item.name,
      shortName: traitName,
      traitId: trait.id,
      traitName,
      icon: `/tft/emblems/${trait.id}.png`,
      source: dropOnlyEmblems.has(traitName) ? 'drop' : 'craftable',
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.shortName.localeCompare(b.shortName, 'zh-CN'));

const output = {
  meta: {
    set: 18,
    patch: '18.1',
    title: 'Enchanted Wilds',
    locale: 'zh_CN',
    syncedAt: '2026-08-30',
    source: 'CommunityDragon',
  },
  traits,
  champions,
  emblems,
  khazixEvolutionTraits: ['裁决使', '迅捷射手', '狂战士', '法师'],
};

await mkdir(path.join(projectRoot, 'app', 'data'), { recursive: true });
await writeFile(
  path.join(projectRoot, 'app', 'data', 'tft-set18.json'),
  `${JSON.stringify(output, null, 2)}\n`,
  'utf8',
);

const downloads = [];
for (const trait of set.traits.filter((entry) => traitByName.has(entry.name))) {
  downloads.push(
    downloadAsset(
      trait.icon,
      path.join(projectRoot, 'public', 'tft', 'traits', `${slug(trait.apiName)}.png`),
    ),
  );
}

for (const champion of championCandidates) {
  downloads.push(
    downloadAsset(
      champion.tileIcon || champion.squareIcon || champion.icon,
      path.join(projectRoot, 'public', 'tft', 'champions', `${slug(champion.apiName)}.png`),
    ),
  );
}

for (const item of emblemItems) {
  if (item.apiName.endsWith('Augment')) continue;
  const traitName = item.name.replace(/纹章$/, '');
  const trait = traitByName.get(traitName);
  if (!trait) continue;
  downloads.push(
    downloadAsset(
      item.icon,
      path.join(projectRoot, 'public', 'tft', 'emblems', `${trait.id}.png`),
    ),
  );
}

await Promise.all(downloads);
console.log(
  `Synced ${champions.length} champion candidates, ${traits.length} traits, and ${emblems.length} emblems.`,
);
