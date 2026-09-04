import GLPK, { type LP } from 'glpk.js';

export type Trait = {
  id: string;
  name: string;
  breakpoints: number[];
  icon: string;
  unique: boolean;
};

export type Champion = {
  id: string;
  name: string;
  cost: number;
  traits: string[];
  traitWeights: Record<string, number>;
  image: string;
  group: string;
};

export type Emblem = {
  id: string;
  name: string;
  shortName: string;
  traitId: string;
  traitName: string;
  icon: string;
  source: 'craftable' | 'drop';
};

export type TftData = {
  traits: Trait[];
  champions: Champion[];
  emblems: Emblem[];
  khazixEvolutionTraits: string[];
};

export type BoardTrait = Trait & {
  count: number;
  nextBreakpoint?: number;
};

export type EmblemAssignment = {
  traitId: string;
  championId: string;
  copy: number;
};

export type BoardResult = {
  status: 'optimal' | 'feasible' | 'infeasible';
  champions: Champion[];
  activeTraits: BoardTrait[];
  emblemAssignments: EmblemAssignment[];
  khazixEvolutionTraits: string[];
  score: number;
  totalCost: number;
};

export type EmblemRecommendation = {
  emblem: Emblem;
  boards: BoardResult[];
  score: number;
};

const glpkPromise = GLPK();
const variableName = (prefix: string, id: string) =>
  `${prefix}_${id.replace(/[^a-z0-9-]/gi, '_')}`;

function championWeights(
  champion: Champion,
  data: TftData,
  evolvedKhazix: boolean,
) {
  const weights = { ...champion.traitWeights };
  if (evolvedKhazix && champion.id.includes('18-khazix')) {
    for (const name of data.khazixEvolutionTraits) weights[name] = 1;
  }
  return weights;
}

async function solveBoard(
  data: TftData,
  level: number,
  emblemCounts: Record<string, number>,
  evolvedKhazix: boolean,
  exclusions: string[][],
): Promise<BoardResult> {
  const glpk = await glpkPromise;
  const championPool = data.champions.filter(
    (champion) => evolvedKhazix || !champion.id.includes('18-khazix'),
  );
  const scoringTraits = data.traits.filter(
    (trait) => !trait.unique && trait.breakpoints.length > 0,
  );
  const championVariables = new Map(
    championPool.map((champion) => [
      champion.id,
      variableName('champion', champion.id),
    ]),
  );
  const binaries = [...championVariables.values()];
  const assignmentVariables: Array<{
    name: string;
    traitId: string;
    championId: string;
  }> = [];
  const assignmentsByChampion = new Map<string, string[]>();

  const subjectTo: LP['subjectTo'] = [
    {
      name: 'slots',
      vars: championPool.map((champion) => ({
        name: championVariables.get(champion.id)!,
        coef: 1,
      })),
      bnds: { type: glpk.GLP_FX, lb: level, ub: level },
    },
    {
      name: 'lux',
      vars: championPool
        .filter((champion) => champion.group === 'lux')
        .map((champion) => ({
          name: championVariables.get(champion.id)!,
          coef: 1,
        })),
      bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
    },
  ];

  const objectiveVars = championPool.map((champion) => ({
    name: championVariables.get(champion.id)!,
    coef: -champion.cost * 0.01,
  }));

  for (const trait of scoringTraits) {
    const traitVariable = variableName('trait', trait.id);
    const firstBreakpoint = Math.min(...trait.breakpoints);
    binaries.push(traitVariable);
    objectiveVars.push({ name: traitVariable, coef: 100 });

    subjectTo.push({
      name: `active_${trait.id}`,
      vars: [
        { name: traitVariable, coef: firstBreakpoint },
        ...championPool
          .map((champion) => ({
            name: championVariables.get(champion.id)!,
            coef: -(
              championWeights(champion, data, evolvedKhazix)[trait.name] ?? 0
            ),
          }))
          .filter((entry) => entry.coef !== 0),
      ],
      bnds: {
        type: glpk.GLP_UP,
        lb: 0,
        ub: emblemCounts[trait.id] ?? 0,
      },
    });

    const copies = emblemCounts[trait.id] ?? 0;
    if (copies > 0) {
      const eligibleChampions = championPool.filter(
        (champion) =>
          !(championWeights(champion, data, evolvedKhazix)[trait.name] > 0),
      );
      const assignmentVars = eligibleChampions.map((champion) => {
        const name = variableName('emblem', `${trait.id}_${champion.id}`);
        binaries.push(name);
        assignmentVariables.push({
          name,
          traitId: trait.id,
          championId: champion.id,
        });
        assignmentsByChampion.set(champion.id, [
          ...(assignmentsByChampion.get(champion.id) ?? []),
          name,
        ]);
        subjectTo.push({
          name: `link_${trait.id}_${champion.id}`,
          vars: [
            { name, coef: 1 },
            { name: championVariables.get(champion.id)!, coef: -1 },
          ],
          bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 },
        });
        return { name, coef: 1 };
      });

      subjectTo.push({
        name: `assign_${trait.id}`,
        vars: assignmentVars,
        bnds: { type: glpk.GLP_FX, lb: copies, ub: copies },
      });
    }
  }

  for (const [championId, names] of assignmentsByChampion) {
    subjectTo.push({
      name: `item_capacity_${championId}`,
      vars: names.map((name) => ({ name, coef: 1 })),
      bnds: { type: glpk.GLP_UP, lb: 0, ub: 3 },
    });
  }

  exclusions.forEach((championIds, index) => {
    subjectTo.push({
      name: `exclude_${index}`,
      vars: championIds.map((id) => ({
        name: championVariables.get(id)!,
        coef: 1,
      })),
      bnds: { type: glpk.GLP_UP, lb: 0, ub: level - 1 },
    });
  });

  const lp: LP = {
    name: `tft_level_${level}`,
    objective: {
      direction: glpk.GLP_MAX,
      name: 'score',
      vars: objectiveVars,
    },
    subjectTo,
    binaries,
  };

  const solved = await glpk.solve(lp, {
    msglev: glpk.GLP_MSG_OFF,
    presol: true,
    mipgap: 0,
    tmlim: 5,
  });
  const status = solved.result.status;

  if (![glpk.GLP_OPT, glpk.GLP_FEAS].includes(status)) {
    return {
      status: 'infeasible',
      champions: [],
      activeTraits: [],
      emblemAssignments: [],
      khazixEvolutionTraits: [],
      score: 0,
      totalCost: 0,
    };
  }

  const champions = championPool
    .filter(
      (champion) =>
        (solved.result.vars[championVariables.get(champion.id)!] ?? 0) > 0.5,
    )
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'zh-CN'));
  const assignmentCounts = new Map<string, number>();
  const emblemAssignments = assignmentVariables
    .filter((assignment) => (solved.result.vars[assignment.name] ?? 0) > 0.5)
    .map((assignment) => {
      const copy = (assignmentCounts.get(assignment.traitId) ?? 0) + 1;
      assignmentCounts.set(assignment.traitId, copy);
      return {
        traitId: assignment.traitId,
        championId: assignment.championId,
        copy,
      };
    });
  const counts = new Map<string, number>();

  for (const champion of champions) {
    for (const [name, weight] of Object.entries(
      championWeights(champion, data, evolvedKhazix),
    )) {
      counts.set(name, (counts.get(name) ?? 0) + weight);
    }
  }

  for (const [traitId, copies] of Object.entries(emblemCounts)) {
    const trait = data.traits.find((entry) => entry.id === traitId);
    if (trait && copies > 0)
      counts.set(trait.name, (counts.get(trait.name) ?? 0) + copies);
  }

  const activeTraits = scoringTraits
    .filter(
      (trait) =>
        (counts.get(trait.name) ?? 0) >= Math.min(...trait.breakpoints),
    )
    .map((trait) => {
      const count = counts.get(trait.name) ?? 0;
      return {
        ...trait,
        count,
        nextBreakpoint: trait.breakpoints.find((point) => point > count),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));

  return {
    status: status === glpk.GLP_OPT ? 'optimal' : 'feasible',
    champions,
    activeTraits,
    emblemAssignments,
    khazixEvolutionTraits: champions.some((champion) =>
      champion.id.includes('18-khazix'),
    )
      ? data.khazixEvolutionTraits
      : [],
    score: activeTraits.length,
    totalCost: champions.reduce((sum, champion) => sum + champion.cost, 0),
  };
}

export async function optimizeBoards(
  data: TftData,
  level: number,
  emblemCounts: Record<string, number>,
  evolvedKhazix = false,
  limit = 3,
): Promise<BoardResult[]> {
  const results: BoardResult[] = [];
  const exclusions: string[][] = [];
  let ceiling: number | undefined;

  for (let index = 0; index < limit; index += 1) {
    const result = await solveBoard(
      data,
      level,
      emblemCounts,
      evolvedKhazix,
      exclusions,
    );
    if (result.status === 'infeasible') break;
    if (ceiling === undefined) ceiling = result.score;
    if (result.score < ceiling) break;
    results.push(result);
    exclusions.push(result.champions.map((champion) => champion.id));
  }

  return results;
}

export async function recommendCraftableEmblems(
  data: TftData,
  level: number,
  emblemCounts: Record<string, number>,
  candidates: Emblem[],
  evolvedKhazix = false,
  limit = 2,
): Promise<EmblemRecommendation[]> {
  const recommendations: EmblemRecommendation[] = [];

  for (const emblem of candidates) {
    const nextCounts = {
      ...emblemCounts,
      [emblem.id]: (emblemCounts[emblem.id] ?? 0) + 1,
    };
    const boards = await optimizeBoards(
      data,
      level,
      nextCounts,
      evolvedKhazix,
      limit,
    );
    if (boards.length === 0) continue;
    recommendations.push({ emblem, boards, score: boards[0].score });
  }

  recommendations.sort(
    (a, b) =>
      b.score - a.score ||
      a.boards[0].totalCost - b.boards[0].totalCost ||
      a.emblem.shortName.localeCompare(b.emblem.shortName, 'zh-CN'),
  );

  const ceiling = recommendations[0]?.score;
  return recommendations.filter(
    (recommendation) => recommendation.score === ceiling,
  );
}
