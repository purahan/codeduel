// Standard chess-style ELO rating system
// K=32 means ratings change faster — good for a competitive platform
const K = 32;

export function calcElo(
  myElo: number,
  opponentElo: number,
  won: boolean
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
  const actual = won ? 1 : 0;
  return Math.round(myElo + K * (actual - expected));
}
