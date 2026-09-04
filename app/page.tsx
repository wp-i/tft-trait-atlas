'use client';

import {
  createElement,
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
} from 'react';
import { Check, Copy, Info, Leaf, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import rawData from '@/app/data/tft-set18.json';
import rawPlannerCodes from '@/app/data/tft-set18-planner.json';
import {
  optimizeBoards,
  type BoardResult,
  type CraftBudget,
  type TftData,
} from '@/app/lib/optimizer';

const data = rawData as unknown as TftData;
const plannerCodes = rawPlannerCodes as Record<string, number>;
const levels = [8, 9, 10, 11] as const;
const defaultCounts: Record<string, number> = {};
const professionEmblemIds = new Set([
  '18-executioner',
  '18-brawler',
  '18-spellweaver',
  '18-defender',
  '18-slayer',
  '18-hunter',
  '18-invoker',
  '18-rapidfire',
  '18-vanguard',
  'juggernaut18',
]);
const sortByCraftability = (emblems: TftData['emblems']) =>
  [...emblems].sort(
    (a, b) => Number(a.source === 'drop') - Number(b.source === 'drop'),
  );
const emblemGroups = [
  sortByCraftability(
    data.emblems.filter((emblem) => !professionEmblemIds.has(emblem.id)),
  ),
  sortByCraftability(
    data.emblems.filter((emblem) => professionEmblemIds.has(emblem.id)),
  ),
];
type CraftTool = 'spatula' | 'pan';
const craftTools: CraftTool[] = ['spatula', 'pan'];
const craftToolMeta = {
  spatula: {
    name: '金铲铲',
    icon: '/tft/items/spatula.png',
    scope: '种族纹章',
  },
  pan: {
    name: '金锅锅',
    icon: '/tft/items/frying-pan.png',
    scope: '职业纹章',
  },
} satisfies Record<CraftTool, { name: string; icon: string; scope: string }>;
const craftRecipes: Record<CraftTool, Record<string, string>> = {
  spatula: {
    '18-blackthorn': '巨人腰带',
    '18-fae': '暴风大剑',
    primal18: '拳套',
    '18-sprykin': '负极斗篷',
    '18-lunar': '女神之泪',
    '18-elderwood': '锁子甲',
    '18-blossom': '无用大棒',
    '18-inferno': '反曲弓',
  },
  pan: {
    '18-vanguard': '锁子甲',
    '18-hunter': '暴风大剑',
    '18-slayer': '负极斗篷',
    '18-invoker': '女神之泪',
    '18-brawler': '巨人腰带',
    '18-executioner': '拳套',
    '18-rapidfire': '反曲弓',
    '18-spellweaver': '无用大棒',
  },
};
const componentIcons: Record<string, string> = {
  巨人腰带: '/tft/items/giants-belt.png',
  暴风大剑: '/tft/items/bf-sword.png',
  拳套: '/tft/items/sparring-gloves.png',
  负极斗篷: '/tft/items/negatron-cloak.png',
  女神之泪: '/tft/items/tear-of-the-goddess.png',
  锁子甲: '/tft/items/chain-vest.png',
  无用大棒: '/tft/items/needlessly-large-rod.png',
  反曲弓: '/tft/items/recurve-bow.png',
};
const craftableEmblems: Record<CraftTool, TftData['emblems']> = {
  spatula: data.emblems.filter((emblem) => emblem.id in craftRecipes.spatula),
  pan: data.emblems.filter((emblem) => emblem.id in craftRecipes.pan),
};
const costColors: Record<number, string> = {
  1: '#8a9690',
  2: '#55a873',
  3: '#49a4c8',
  4: '#aa69d5',
  5: '#d6a54d',
};

const staticAsset = (src: string) => (src.startsWith('/') ? `.${src}` : src);

const createTeamPlannerCode = (board: BoardResult) => {
  if (board.champions.length > 10) return undefined;
  const codes = board.champions.map(
    (champion) => plannerCodes[champion.apiName],
  );
  if (codes.some((code) => !Number.isInteger(code))) return undefined;
  while (codes.length < 10) codes.push(0);
  return `02${codes
    .map((code) => code.toString(16).padStart(3, '0'))
    .join('')}TFTSet18`;
};

function StaticImage({
  unoptimized: _unoptimized,
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & {
  alt: string;
  unoptimized?: boolean;
}) {
  return createElement('img', { ...props, alt });
}

export default function Home() {
  const [emblemCounts, setEmblemCounts] =
    useState<Record<string, number>>(defaultCounts);
  const [activeLevel, setActiveLevel] = useState<(typeof levels)[number]>(8);
  const [craftToolCounts, setCraftToolCounts] = useState<
    Record<CraftTool, number>
  >({ spatula: 0, pan: 0 });
  const [evolvedKhazix, setEvolvedKhazix] = useState(false);
  const [results, setResults] = useState<
    Partial<Record<number, BoardResult[]>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedBoardKey, setCopiedBoardKey] = useState('');

  const selectedEmblems = useMemo(
    () => data.emblems.filter((emblem) => (emblemCounts[emblem.id] ?? 0) > 0),
    [emblemCounts],
  );
  const totalEmblems = Object.values(emblemCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const totalCraftTools = craftTools.reduce(
    (sum, tool) => sum + craftToolCounts[tool],
    0,
  );
  const craftBudgets = useMemo<CraftBudget[]>(
    () =>
      craftTools
        .filter((tool) => craftToolCounts[tool] > 0)
        .map((tool) => ({
          toolId: tool,
          count: craftToolCounts[tool],
          emblemIds: craftableEmblems[tool].map((emblem) => emblem.id),
        })),
    [craftToolCounts],
  );
  const variants = results[activeLevel] ?? [];
  const previousResult = results[activeLevel - 1]?.[0];
  const previousGroups = new Set(
    previousResult?.champions.map((champion) => champion.group),
  );

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      setResults({});
      try {
        for (const level of levels) {
          const boards = await optimizeBoards(
            data,
            level,
            emblemCounts,
            evolvedKhazix,
            2,
            craftBudgets,
          );
          if (cancelled) return;
          setResults((current) => ({ ...current, [level]: boards }));
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '阵容计算失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [craftBudgets, emblemCounts, evolvedKhazix]);

  const cycleCraftTool = (tool: CraftTool) => {
    setCraftToolCounts((current) => ({
      ...current,
      [tool]: current[tool] >= 3 ? 0 : current[tool] + 1,
    }));
  };

  const cycleEmblem = (id: string) => {
    setEmblemCounts((current) => {
      const next = { ...current };
      const count = next[id] ?? 0;
      if (count >= 3) delete next[id];
      else next[id] = count + 1;
      return next;
    });
  };

  const assignedEmblems = (board: BoardResult, championId: string) =>
    board.emblemAssignments
      .filter((assignment) => assignment.championId === championId)
      .map((assignment) =>
        data.emblems.find((emblem) => emblem.traitId === assignment.traitId),
      )
      .filter(Boolean);

  const copyTeamPlannerCode = async (code: string, boardKey: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopiedBoardKey(boardKey);
    window.setTimeout(
      () =>
        setCopiedBoardKey((current) => (current === boardKey ? '' : current)),
      1600,
    );
  };

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="border-b border-white/8 bg-[#07100e]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <Leaf className="size-4" />
            </div>
            <p className="text-sm font-semibold tracking-[0.15em] text-[#f0e7ca]">
              羁绊天梯
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#8fa097]">
            <span className="status-dot" />
            <span>S18 · 18.1 离线数据</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 pb-14 pt-5 lg:px-8">
        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(380px,0.78fr)_minmax(660px,1.42fr)]">
          <section
            className="panel h-full p-4 sm:p-5"
            aria-labelledby="emblem-heading"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="emblem-heading"
                className="text-lg font-semibold text-[#e9e4d8]"
              >
                录入纹章
              </h2>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-1.5 text-xs text-[#a9b6af]">
                  已选 <b className="text-[#e6d28d]">{totalEmblems}</b> 枚
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#7f9188] hover:bg-white/5 hover:text-[#d8e0dc]"
                  onClick={() => {
                    setEmblemCounts({});
                    setCraftToolCounts({ spatula: 0, pan: 0 });
                  }}
                  disabled={totalEmblems === 0 && totalCraftTools === 0}
                >
                  <RotateCcw /> 清空
                </Button>
              </div>
            </div>

            <p className="mb-3 text-xs leading-5 text-[#687d73]">
              铲、锅与纹章每次点击增加 1 枚，第 4
              次点击归零。纹章会自动分配给不具备该羁绊的弈子。
            </p>
            <div className="craft-tool-panel mb-4">
              <div className="craft-tool-selector">
                {craftTools.map((tool) => {
                  const meta = craftToolMeta[tool];
                  const count = craftToolCounts[tool];
                  return (
                    <button
                      key={tool}
                      type="button"
                      className="craft-tool-choice"
                      data-active={count > 0}
                      onClick={() => cycleCraftTool(tool)}
                      aria-label={`${meta.name}，当前 ${count} 枚，点击增加`}
                    >
                      {count > 0 && (
                        <span className="emblem-count">{count}</span>
                      )}
                      <StaticImage
                        unoptimized
                        src={staticAsset(meta.icon)}
                        alt=""
                        width={30}
                        height={30}
                      />
                      <span className="craft-tool-label">
                        <strong>{meta.name}</strong>
                        <small>{meta.scope}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              {emblemGroups.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  className={
                    groupIndex > 0 ? 'emblem-group-divider' : undefined
                  }
                >
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {group.map((emblem) => {
                      const count = emblemCounts[emblem.id] ?? 0;
                      return (
                        <button
                          key={emblem.id}
                          type="button"
                          aria-label={`${emblem.name}，当前 ${count} 枚，点击增加`}
                          onClick={() => cycleEmblem(emblem.id)}
                          className="emblem-button group relative"
                          data-active={count > 0}
                        >
                          {count > 0 && (
                            <span className="emblem-count">{count}</span>
                          )}
                          <span className="emblem-image-wrap">
                            <StaticImage
                              unoptimized
                              src={staticAsset(emblem.icon)}
                              alt=""
                              width={42}
                              height={42}
                              className="size-full object-cover"
                            />
                          </span>
                          <span className="mt-1.5 line-clamp-1 text-[11px] text-[#9fafa7] group-data-[active=true]:text-[#f1e5bc]">
                            {emblem.shortName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 min-h-14 rounded-xl border border-white/7 bg-black/10 p-3">
              {selectedEmblems.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedEmblems.map((emblem) => (
                    <button
                      key={emblem.id}
                      type="button"
                      onClick={() =>
                        setEmblemCounts((current) => {
                          const next = { ...current };
                          delete next[emblem.id];
                          return next;
                        })
                      }
                      className="selected-emblem"
                      aria-label={`移除${emblem.name}`}
                    >
                      <StaticImage
                        unoptimized
                        src={staticAsset(emblem.icon)}
                        alt=""
                        width={22}
                        height={22}
                      />
                      <span>{emblem.shortName}</span>
                      <b>×{emblemCounts[emblem.id]}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-1 text-center text-xs text-[#62766d]">
                  未选择纹章，将计算自然阵容上限
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-[#7caf91]/15 bg-[#7caf91]/[0.045] p-3">
              <div>
                <p className="text-sm font-medium text-[#b8c9c0]">
                  满进化卡兹克
                </p>
                <p className="mt-0.5 text-[11px] text-[#687d73]">
                  开启后纳入候选，并标出四项所需进化
                </p>
              </div>
              <Switch
                checked={evolvedKhazix}
                onCheckedChange={setEvolvedKhazix}
                aria-label="计入满进化卡兹克"
              />
            </div>
          </section>

          <section
            className="panel result-panel h-full overflow-hidden"
            aria-label="阵容结果"
          >
            <div className="border-b border-white/7 p-4 sm:p-5">
              {loading && (
                <div className="mb-3 flex justify-end">
                  <span className="flex items-center gap-2 text-xs text-[#80948a]">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    {totalCraftTools > 0 ? '正在计算合成' : '正在精确求解'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {levels.map((level) => {
                  const score = results[level]?.[0]?.score;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setActiveLevel(level)}
                      className="level-button"
                      data-active={activeLevel === level}
                    >
                      <span>{level} 人口</span>
                      <strong>{score ?? '—'}</strong>
                      <small>羁绊上限</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="result-body relative p-4 sm:p-5">
              {error ? (
                <div className="empty-result">
                  <Info className="size-5" />
                  <p>计算器暂时没有响应，请刷新后重试。</p>
                </div>
              ) : variants.length === 0 ? (
                <div className="empty-result min-h-72">
                  <LoaderCircle className="size-5 animate-spin" />
                  <p>
                    {totalCraftTools > 0
                      ? '正在生成合成方案…'
                      : `正在生成 ${activeLevel} 人口阵容…`}
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="variant-scroll"
                    aria-label={`${activeLevel} 人口同分阵容方案`}
                  >
                    {variants.map((board, variantIndex) => {
                      const plannerCode = createTeamPlannerCode(board);
                      const boardKey = `${activeLevel}-${variantIndex}`;
                      return (
                        <article key={variantIndex} className="variant-board">
                          <div className="mb-4 flex flex-wrap items-center gap-3">
                            <div className="score-badge">
                              <strong>{board.score}</strong>
                              <span>个激活羁绊</span>
                            </div>
                            <div className="text-xs leading-5 text-[#6f8379]">
                              方案 {variantIndex + 1}
                            </div>
                            <button
                              type="button"
                              className="team-code-button"
                              disabled={!plannerCode}
                              onClick={() =>
                                plannerCode &&
                                copyTeamPlannerCode(plannerCode, boardKey)
                              }
                              title={
                                plannerCode
                                  ? '复制后可粘贴到云顶之弈小队规划器'
                                  : '小队规划器最多支持 10 名弈子'
                              }
                            >
                              {plannerCode ? (
                                copiedBoardKey === boardKey ? (
                                  <Check />
                                ) : (
                                  <Copy />
                                )
                              ) : null}
                              {plannerCode
                                ? copiedBoardKey === boardKey
                                  ? '已复制'
                                  : '复制小队代码'
                                : '规划器最多 10 人'}
                            </button>
                          </div>

                          {board.craftedEmblems.length > 0 && (
                            <div className="board-craft-summary">
                              <div>
                                {board.craftedEmblems.map((crafted) => {
                                  const tool = crafted.toolId as CraftTool;
                                  const emblem = data.emblems.find(
                                    (entry) => entry.id === crafted.traitId,
                                  );
                                  const component =
                                    craftRecipes[tool]?.[crafted.traitId];
                                  const componentIcon = component
                                    ? componentIcons[component]
                                    : undefined;
                                  if (!emblem || !component || !componentIcon)
                                    return null;
                                  return (
                                    <div
                                      key={`${tool}-${crafted.traitId}`}
                                      className="board-craft-item"
                                    >
                                      <StaticImage
                                        unoptimized
                                        src={staticAsset(
                                          craftToolMeta[tool].icon,
                                        )}
                                        alt=""
                                        width={22}
                                        height={22}
                                      />
                                      <span>+</span>
                                      <StaticImage
                                        unoptimized
                                        src={staticAsset(componentIcon)}
                                        alt={component}
                                        title={component}
                                        width={22}
                                        height={22}
                                      />
                                      <span>→</span>
                                      <StaticImage
                                        unoptimized
                                        src={staticAsset(emblem.icon)}
                                        alt=""
                                        width={22}
                                        height={22}
                                      />
                                      <b>
                                        {emblem.shortName}转
                                        {crafted.count > 1
                                          ? ` ×${crafted.count}`
                                          : ''}
                                      </b>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div
                            className="board-grid"
                            style={
                              {
                                '--board-size': activeLevel,
                              } as React.CSSProperties
                            }
                          >
                            {board.champions.map((champion) => {
                              const items = assignedEmblems(board, champion.id);
                              const isNew =
                                activeLevel > 8 &&
                                !previousGroups.has(champion.group);
                              const isEvolved =
                                board.khazixEvolutionTraits.length > 0 &&
                                champion.id.includes('18-khazix');
                              const doubleTrait = Object.entries(
                                champion.traitWeights,
                              ).find(([, value]) => value > 1)?.[0];
                              return (
                                <article
                                  key={champion.id}
                                  className="champion-card"
                                >
                                  <div
                                    className="champion-image"
                                    style={
                                      {
                                        '--cost': costColors[champion.cost],
                                      } as React.CSSProperties
                                    }
                                  >
                                    <StaticImage
                                      unoptimized
                                      src={staticAsset(champion.image)}
                                      alt={champion.name}
                                      width={128}
                                      height={128}
                                    />
                                    <span className="cost-badge">
                                      {champion.cost}
                                    </span>
                                    {isNew && (
                                      <span className="new-badge">
                                        本级新增
                                      </span>
                                    )}
                                    {items.length > 0 && (
                                      <div className="item-stack">
                                        {items.map(
                                          (emblem) =>
                                            emblem && (
                                              <StaticImage
                                                unoptimized
                                                key={emblem.id}
                                                src={staticAsset(emblem.icon)}
                                                alt={emblem.name}
                                                title={emblem.name}
                                                width={20}
                                                height={20}
                                              />
                                            ),
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <h3 title={champion.name}>{champion.name}</h3>
                                  {(isEvolved || doubleTrait) && (
                                    <p className="special-note">
                                      {isEvolved
                                        ? '四项进化'
                                        : `${doubleTrait} ×2`}
                                    </p>
                                  )}
                                </article>
                              );
                            })}
                          </div>

                          {board.khazixEvolutionTraits.length > 0 && (
                            <div className="khazix-evolution-callout">
                              <span>卡兹克需进化</span>
                              <div>
                                {board.khazixEvolutionTraits.map((trait) => (
                                  <b key={trait}>{trait}</b>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="my-4 h-px bg-white/7" />
                          <div className="flex flex-wrap gap-2">
                            {board.activeTraits.map((trait) => {
                              const fromEmblem =
                                (emblemCounts[trait.id] ?? 0) > 0 ||
                                board.craftedEmblems.some(
                                  (crafted) => crafted.traitId === trait.id,
                                );
                              return (
                                <div
                                  key={trait.id}
                                  className="trait-pill"
                                  data-emblem={fromEmblem}
                                >
                                  <StaticImage
                                    unoptimized
                                    src={staticAsset(trait.icon)}
                                    alt=""
                                    width={19}
                                    height={19}
                                  />
                                  <span>{trait.name}</span>
                                  <b>{trait.count}</b>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/6 bg-black/10 px-3 py-2.5 text-[11px] leading-5 text-[#667a71]">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <p>
                      每个人口独立求最优解；“本级新增”仅用于对照上一人口主清单。拉克丝选定羁绊按
                      2 层计算，专属羁绊与隐藏日月双蚀不计入总数。
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
