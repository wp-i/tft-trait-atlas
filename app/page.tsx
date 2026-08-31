'use client';

import { createElement, useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react';
import {
  Info,
  Leaf,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import rawData from '@/app/data/tft-set18.json';
import {
  optimizeBoards,
  type BoardResult,
  type TftData,
} from '@/app/lib/optimizer';

const data = rawData as unknown as TftData;
const levels = [8, 9, 10, 11] as const;
const defaultEmblem = data.emblems.find((emblem) => emblem.shortName === '地狱火')!;
const defaultCounts = { [defaultEmblem.id]: 1 };
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
const emblemGroups = [
  data.emblems.filter((emblem) => !professionEmblemIds.has(emblem.id)),
  data.emblems.filter((emblem) => professionEmblemIds.has(emblem.id)),
];
const costColors: Record<number, string> = {
  1: '#8a9690',
  2: '#55a873',
  3: '#49a4c8',
  4: '#aa69d5',
  5: '#d6a54d',
};

const staticAsset = (src: string) => src.startsWith('/') ? `.${src}` : src;

function StaticImage({
  unoptimized: _unoptimized,
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & { alt: string; unoptimized?: boolean }) {
  return createElement('img', { ...props, alt });
}

export default function Home() {
  const [emblemCounts, setEmblemCounts] = useState<Record<string, number>>(defaultCounts);
  const [activeLevel, setActiveLevel] = useState<(typeof levels)[number]>(8);
  const [evolvedKhazix, setEvolvedKhazix] = useState(false);
  const [results, setResults] = useState<Partial<Record<number, BoardResult[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedEmblems = useMemo(
    () =>
      data.emblems.filter((emblem) => (emblemCounts[emblem.id] ?? 0) > 0),
    [emblemCounts],
  );
  const totalEmblems = Object.values(emblemCounts).reduce((sum, count) => sum + count, 0);
  const variants = results[activeLevel] ?? [];
  const previousResult = results[activeLevel - 1]?.[0];
  const previousGroups = new Set(previousResult?.champions.map((champion) => champion.group));

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      setResults({});
      try {
        for (const level of levels) {
          const boards = await optimizeBoards(data, level, emblemCounts, evolvedKhazix, 2);
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
  }, [emblemCounts, evolvedKhazix]);

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
      .map((assignment) => data.emblems.find((emblem) => emblem.traitId === assignment.traitId))
      .filter(Boolean);

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="border-b border-white/8 bg-[#07100e]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-mark"><Leaf className="size-4" /></div>
            <p className="text-sm font-semibold tracking-[0.15em] text-[#f0e7ca]">羁绊天梯</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#8fa097]">
            <span className="status-dot" />
            <span>S18 · 18.1 离线数据</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 pb-14 pt-5 lg:px-8">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(380px,0.78fr)_minmax(660px,1.42fr)]">
          <section className="panel p-4 sm:p-5 xl:sticky xl:top-5" aria-labelledby="emblem-heading">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="eyebrow">STEP 01</p>
                <h2 id="emblem-heading" className="mt-1 text-lg font-semibold text-[#e9e4d8]">录入纹章</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-1.5 text-xs text-[#a9b6af]">
                  已选 <b className="text-[#e6d28d]">{totalEmblems}</b> 枚
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#7f9188] hover:bg-white/5 hover:text-[#d8e0dc]"
                  onClick={() => setEmblemCounts({})}
                  disabled={totalEmblems === 0}
                >
                  <RotateCcw /> 清空
                </Button>
              </div>
            </div>

            <p className="mb-3 text-xs leading-5 text-[#687d73]">
              每次点击增加 1 枚；第 4 次点击归零。纹章会自动分配给不具备该羁绊的弈子。
            </p>
            <div>
              {emblemGroups.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  className={groupIndex > 0 ? 'emblem-group-divider' : undefined}
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
                          {count > 0 && <span className="emblem-count">{count}</span>}
                          <span className="emblem-image-wrap">
                            <StaticImage unoptimized src={staticAsset(emblem.icon)} alt="" width={42} height={42} className="size-full object-cover" />
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
                      onClick={() => setEmblemCounts((current) => {
                        const next = { ...current };
                        delete next[emblem.id];
                        return next;
                      })}
                      className="selected-emblem"
                      aria-label={`移除${emblem.name}`}
                    >
                      <StaticImage unoptimized src={staticAsset(emblem.icon)} alt="" width={22} height={22} />
                      <span>{emblem.shortName}</span>
                      <b>×{emblemCounts[emblem.id]}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-1 text-center text-xs text-[#62766d]">未选择纹章，将计算自然阵容上限</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-[#7caf91]/15 bg-[#7caf91]/[0.045] p-3">
              <div>
                <p className="text-sm font-medium text-[#b8c9c0]">满进化卡兹克</p>
                <p className="mt-0.5 text-[11px] text-[#687d73]">计入裁决、迅捷、狂战与法师四项进化</p>
              </div>
              <Switch
                checked={evolvedKhazix}
                onCheckedChange={setEvolvedKhazix}
                aria-label="计入满进化卡兹克"
              />
            </div>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="result-heading">
            <div className="border-b border-white/7 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">STEP 02</p>
                  <h2 id="result-heading" className="mt-1 text-lg font-semibold text-[#e9e4d8]">人口上限清单</h2>
                </div>
                {loading && (
                  <span className="flex items-center gap-2 text-xs text-[#80948a]">
                    <LoaderCircle className="size-3.5 animate-spin" /> 正在精确求解
                  </span>
                )}
              </div>

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

            <div className="relative p-4 sm:p-5">
              {error ? (
                <div className="empty-result">
                  <Info className="size-5" />
                  <p>计算器暂时没有响应，请刷新后重试。</p>
                </div>
              ) : variants.length === 0 ? (
                <div className="empty-result min-h-72">
                  <LoaderCircle className="size-5 animate-spin" />
                  <p>正在生成 {activeLevel} 人口阵容…</p>
                </div>
              ) : (
                <>
                  {variants.length > 1 && (
                    <div className="mb-3 flex items-center justify-end text-[11px] text-[#70837a]">
                      上下滚动查看更多同分方案
                    </div>
                  )}
                  <div
                    className="variant-scroll"
                    aria-label={`${activeLevel} 人口同分阵容方案`}
                  >
                    {variants.map((board, variantIndex) => (
                      <article key={variantIndex} className="variant-board">
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                          <div className="score-badge">
                            <strong>{board.score}</strong>
                            <span>个激活羁绊</span>
                          </div>
                          <div className="text-xs leading-5 text-[#6f8379]">
                            方案 {variantIndex + 1}<br />
                            总费用 {board.totalCost} 金币
                          </div>
                        </div>

                        <div
                          className="board-grid"
                          style={{ '--board-size': activeLevel } as React.CSSProperties}
                        >
                          {board.champions.map((champion) => {
                            const items = assignedEmblems(board, champion.id);
                            const isNew = activeLevel > 8 && !previousGroups.has(champion.group);
                            const isEvolved = evolvedKhazix && champion.id.includes('18-khazix');
                            const doubleTrait = Object.entries(champion.traitWeights).find(([, value]) => value > 1)?.[0];
                            return (
                              <article key={champion.id} className="champion-card">
                                <div
                                  className="champion-image"
                                  style={{ '--cost': costColors[champion.cost] } as React.CSSProperties}
                                >
                                  <StaticImage unoptimized src={staticAsset(champion.image)} alt={champion.name} width={128} height={128} />
                                  <span className="cost-badge">{champion.cost}</span>
                                  {isNew && <span className="new-badge">本级新增</span>}
                                  {items.length > 0 && (
                                    <div className="item-stack">
                                      {items.map((emblem) => emblem && (
                                        <StaticImage unoptimized key={emblem.id} src={staticAsset(emblem.icon)} alt={emblem.name} title={emblem.name} width={20} height={20} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <h3 title={champion.name}>{champion.name}</h3>
                                {(isEvolved || doubleTrait) && (
                                  <p className="special-note">{isEvolved ? '满进化' : `${doubleTrait} ×2`}</p>
                                )}
                              </article>
                            );
                          })}
                        </div>

                        <div className="my-5 h-px bg-white/7" />

                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-medium text-[#c5cec9]">已激活非唯一羁绊</h3>
                          <span className="text-[11px] text-[#687b72]">数字为含纹章后的层数</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {board.activeTraits.map((trait) => {
                            const fromEmblem = (emblemCounts[trait.id] ?? 0) > 0;
                            return (
                              <div key={trait.id} className="trait-pill" data-emblem={fromEmblem}>
                                <StaticImage unoptimized src={staticAsset(trait.icon)} alt="" width={19} height={19} />
                                <span>{trait.name}</span>
                                <b>{trait.count}</b>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/6 bg-black/10 px-3 py-2.5 text-[11px] leading-5 text-[#667a71]">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <p>每个人口独立求最优解；“本级新增”仅用于对照上一人口主清单。拉克丝选定羁绊按 2 层计算，专属羁绊与隐藏日月双蚀不计入总数。</p>
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
