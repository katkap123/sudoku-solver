export type Suit = 'H' | 'S' | 'D' | 'C';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card { suit: Suit; rank: Rank }
export interface TrickPlay { playerId: string; card: Card }
export interface RoundScore { prediction: number; won: number; score: number }
export const SUITS: readonly Suit[] = ['H', 'S', 'D', 'C'];
export const RANKS: readonly Rank[] = [2,3,4,5,6,7,8,9,10,11,12,13,14];

export function createDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
}

/** Supply a cryptographically secure random integer generator on the trusted server. */
export function shuffleDeck(deck: readonly Card[], randomInt: (maxExclusive: number) => number): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random index');
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealRound(deck: readonly Card[], playerIds: readonly string[], round: number): Record<string, Card[]> {
  if (playerIds.length !== 4 || new Set(playerIds).size !== 4) throw new Error('Exactly four unique players required');
  if (!Number.isInteger(round) || round < 1 || round > 13) throw new Error('Round must be 1–13');
  if (deck.length < round * 4) throw new Error('Not enough cards');
  const dealt: Record<string, Card[]> = Object.fromEntries(playerIds.map(id => [id, []]));
  for (let i = 0; i < round * 4; i++) dealt[playerIds[i % 4]].push(deck[i]);
  return dealt;
}

export function isLegalPlay(hand: readonly Card[], card: Card, leadSuit?: Suit): boolean {
  const ownsCard = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!ownsCard) return false;
  return !leadSuit || card.suit === leadSuit || !hand.some(c => c.suit === leadSuit);
}

export function trickWinner(plays: readonly TrickPlay[]): string {
  if (plays.length !== 4 || new Set(plays.map(p => p.playerId)).size !== 4) {
    throw new Error('A completed trick requires four unique players');
  }
  const lead = plays[0].card.suit;
  const hearts = plays.filter(p => p.card.suit === 'H');
  const eligible = hearts.length ? hearts : plays.filter(p => p.card.suit === lead);
  return eligible.reduce((best, current) => current.card.rank > best.card.rank ? current : best).playerId;
}

export function canPredict(round: number, earlierPredictions: readonly number[], prediction: number): boolean {
  if (!Number.isInteger(round) || round < 1 || round > 13 || earlierPredictions.length > 3) return false;
  if (!Number.isInteger(prediction) || prediction < 0 || prediction > round) return false;
  if (earlierPredictions.some(p => !Number.isInteger(p) || p < 0 || p > round)) return false;
  return earlierPredictions.length !== 3 || earlierPredictions.reduce((sum, n) => sum + n, prediction) !== round;
}

export function calculateRoundScore(prediction: number, won: number): number {
  if (!Number.isInteger(prediction) || !Number.isInteger(won) || prediction < 0 || won < 0 || prediction > 13 || won > 13) {
    throw new Error('Invalid prediction or tricks won');
  }
  return prediction === won ? 11 * prediction + 10 : 0;
}

export function roundStartingOrder(initialOrder: readonly string[], round: number): string[] {
  if (initialOrder.length !== 4 || new Set(initialOrder).size !== 4) throw new Error('Exactly four unique players required');
  if (!Number.isInteger(round) || round < 1 || round > 13) throw new Error('Invalid round');
  const shift = (round - 1) % 4;
  return [...initialOrder.slice(shift), ...initialOrder.slice(0, shift)];
}

export function totalScores(roundScores: readonly number[][]): number[] {
  if (roundScores.some(scores => scores.length !== 4)) throw new Error('Each round must have four scores');
  return [0,1,2,3].map(player => roundScores.reduce((total, scores) => total + scores[player], 0));
}

export function winningPlayerIndices(scores: readonly number[]): number[] {
  if (scores.length !== 4 || scores.some(score => !Number.isFinite(score))) throw new Error('Exactly four valid scores required');
  const highest = Math.max(...scores);
  return scores.flatMap((score, index) => score === highest ? [index] : []);
}
