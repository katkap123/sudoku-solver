
import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


import {
  CardGameService,
  CardRoom,
  PrivateCardHand,
  PlayingCard,
  CardPlay
} from '../../services/card-game.service';

@Component({
  selector: 'app-card-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './card-game.component.html',
  styleUrl: './card-game.component.scss'
})
export class CardGameComponent implements OnDestroy {

  private game = inject(CardGameService);

  name = '';
  joinCode = '';
  code = '';

  room: CardRoom | null = null;

  busy = false;
  error = '';

  private unsubscribe?: () => void;


hand: PrivateCardHand | null = null;
selectedPrediction = 0;

private unsubscribeHand?: () => void;

get isPredicting(): boolean {
  return this.room?.status === 'playing' &&
    this.room?.phase === 'predicting';
}

get isMyTurn(): boolean {
  return this.isPredicting &&
    this.room?.currentPlayerId === this.myId;
}


get isPlaying(): boolean {
  return this.room?.status === 'playing' &&
    this.room?.phase === 'playing';
}

get isMyPlayTurn(): boolean {
  return this.isPlaying &&
    this.room?.currentPlayerId === this.myId;
}

get isRoundComplete(): boolean {
  return this.room?.phase === 'round-complete';
}

get myCards(): PlayingCard[] {
  if (
    !this.hand ||
    this.hand.roundNumber !== this.room?.roundNumber
  ) {
    return [];
  }

  return this.hand.cards ?? [];
}

get currentTrickPlays(): CardPlay[] {
  return this.room?.currentTrick?.plays ?? [];
}

get lastTrickPlays(): CardPlay[] {
  return this.room?.lastTrick?.plays ?? [];
}

get currentTrickNumber(): number {
  return this.room?.trickNumber ?? 1;
}

get leadSuit(): PlayingCard['suit'] | null {
  return this.currentTrickPlays[0]?.card.suit ?? null;
}

get lastTrickWinner(): string {
  const uid = this.room?.lastTrick?.winnerUid;

  if (!uid) {
    return '';
  }

  return this.room?.players?.[uid]?.name ?? 'Unknown';
}

get myTricksWon(): number {
  return this.room?.tricksWon?.[this.myId] ?? 0;
}

get myRoundScore(): number {
  return this.room?.roundScores?.[this.myId] ?? 0;
}

get myTotalScore(): number {
  return this.room?.players?.[this.myId]?.totalScore ?? 0;
}

get myPrediction(): number | undefined {
  return this.room?.predictions?.[this.myId];
}

get currentPlayerName(): string {
  const uid = this.room?.currentPlayerId ?? '';
  return this.room?.players?.[uid]?.name ?? 'Unknown';
}

get availablePredictions(): number[] {
  const round = this.room?.roundNumber ?? 0;

  if (!this.isMyTurn || round < 1) {
    return [];
  }

  const values = Array.from(
    { length: round + 1 },
    (_, index) => index
  );

  const order = this.room?.playerOrder ?? [];

  if (order[3] !== this.myId) {
    return values;
  }

  const previousTotal = order.slice(0, 3).reduce(
      (sum, uid) => sum + (this.room?.predictions?.[uid] ?? 0),
      0
    );

    return values.filter(
      value => previousTotal + value !== round
    );
  }

  cardLabel(card: PlayingCard): string {
    const symbols: Record<PlayingCard['suit'], string> = {
      H: '♥',
      S: '♠',
      D: '♦',
      C: '♣'
    };

    return `${card.rank}${symbols[card.suit]}`;
  }

  isRedCard(card: PlayingCard): boolean {
    return card.suit === 'H' || card.suit === 'D';
  }


canPlayCard(card: PlayingCard): boolean {
  if (
    !this.isMyPlayTurn ||
    this.busy ||
    this.isRoundComplete
  ) {
    return false;
  }

  // Make sure the card is still in my hand.
  const ownsCard = this.myCards.some(
    c => c.suit === card.suit &&
         c.rank === card.rank
  );

  if (!ownsCard) {
    return false;
  }

  // The first player can lead any card.
  const leadSuit = this.leadSuit;

  if (!leadSuit) {
    return true;
  }

  // Check whether I have a card matching
  // the lead suit.
  const hasLeadSuit = this.myCards.some(
    c => c.suit === leadSuit
  );

  // If I have the lead suit, I must follow it.
  if (hasLeadSuit) {
    return card.suit === leadSuit;
  }

  // Otherwise, I can play any card.
  return true;
}

playCard(card: PlayingCard): void {
  if (!this.canPlayCard(card)) {
    return;
  }

  void this.execute(async () => {
    const result = await this.game.playCard(
      this.code,
      card
    );

    console.log('CARD PLAY RESULT:', result);
  });
}


getPlayerName(uid: string): string {
  return this.room?.players?.[uid]?.name ?? 'Unknown';
}

getPlayerPrediction(uid: string): number | undefined {
  return this.room?.predictions?.[uid];
}

getPlayerTricksWon(uid: string): number {
  return this.room?.tricksWon?.[uid] ?? 0;
}

getPlayerRoundScore(uid: string): number {
  return this.room?.roundScores?.[uid] ?? 0;
}

getPlayerTotalScore(uid: string): number {
  return this.room?.players?.[uid]?.totalScore ?? 0;
}

getPlayedCard(uid: string): PlayingCard | null {
  return this.currentTrickPlays.find(
    play => play.uid === uid
  )?.card ?? null;
}

getLastPlayedCard(uid: string): PlayingCard | null {
  return this.lastTrickPlays.find(
    play => play.uid === uid
  )?.card ?? null;
}

isCurrentPlayer(uid: string): boolean {
  return !this.isRoundComplete &&
    this.room?.currentPlayerId === uid;
}

isLastTrickWinner(uid: string): boolean {
  return this.room?.lastTrick?.winnerUid === uid;
}

get tablePlayerOrder(): string[] {
  const order = this.room?.playerOrder ?? [];

  const myIndex = order.indexOf(this.myId);

  if (myIndex < 0) {
    return order;
  }

  return [
    ...order.slice(myIndex),
    ...order.slice(0, myIndex)
  ];
}


  deal(): void {
    void this.execute(async () => {
      await this.game.dealRound(this.code);
    });
  }

  predict(): void {
    if (
      !this.isMyTurn ||
      !this.availablePredictions.includes(this.selectedPrediction)
    ) {
      return;
    }

    void this.execute(async () => {
      await this.game.submitPrediction(
        this.code,
        this.selectedPrediction
      );
    });
  }

  get myId(): string {
    return this.game.uid;
  }

  get playerEntries(): [string, CardRoom['players'][string]][] {
    return Object.entries(this.room?.players ?? {});
  }

  get playerCount(): number {
    return this.playerEntries.length;
  }

  get isHost(): boolean {
    return !!this.room && this.room.hostId === this.myId;
  }

  get canStart(): boolean {
    return this.isHost &&
      this.room?.status === 'waiting' &&
      this.playerCount === 4 &&
      !this.busy;
  }

  get orderedPlayers(): string[] {
    return (this.room?.playerOrder ?? [])
      .map(uid => this.room?.players?.[uid]?.name ?? 'Unknown');
  }

  get isReady(): boolean {
    return this.room?.status === 'ready';
  }

  
  private connect(code: string): void {
    this.unsubscribe?.();
    this.unsubscribeHand?.();

    this.unsubscribe = undefined;
    this.unsubscribeHand = undefined;
    this.hand = null;
    this.room = null;
    this.code = code;

    this.unsubscribe = this.game.watchRoom(
      code,
      room => {
        if (!room || !room.players?.[this.myId]) {
          this.disconnect();
          this.error = 'Room closed or membership ended.';
          return;
        }

        this.room = room;

        if (
          room.status === 'playing' &&
          !this.unsubscribeHand
        ) {
          this.unsubscribeHand = this.game.watchMyHand(
            code,
            hand => {
              this.hand = hand;
            },
            message => {
              this.error = `Unable to load cards: ${message}`;
            }
          );
        }

        if (
          this.isMyTurn &&
          !this.availablePredictions.includes(
            this.selectedPrediction
          )
        ) {
          this.selectedPrediction =
            this.availablePredictions[0] ?? 0;
        }
      },
      message => {
        this.disconnect();
        this.error = message;
      }
    );
  }

  private disconnect(): void {
    this.unsubscribeHand?.();
    this.unsubscribe?.();
  
    this.unsubscribeHand = undefined;
    this.unsubscribe = undefined;
  
    this.hand = null;
    this.room = null;
    this.code = '';
  }

  private async execute(
    action: () => Promise<void>
  ): Promise<void> {

    if (this.busy) return;

    this.busy = true;
    this.error = '';

    try {
      await action();
    } catch (e: unknown) {
      this.error = e instanceof Error
        ? e.message
        : 'Something went wrong.';
    } finally {
      this.busy = false;
    }
  }

  create(): void {
    void this.execute(async () => {
      const code = await this.game.createRoom(this.name);
      this.connect(code);
    });
  }

  join(): void {
    void this.execute(async () => {
      const code = await this.game.joinRoom(
        this.joinCode,
        this.name
      );

      this.connect(code);
    });
  }

  start(): void {
    void this.execute(async () => {
      await this.game.startGame(this.code);
    });
  }

  async copyRoomCode(): Promise<void> {
    if (!this.code) return;
  
    try {
      await navigator.clipboard.writeText(this.code);
    } catch {
      this.error = 'Unable to copy room code.';
    }
  }

  leave(): void {
    void this.execute(async () => {
      const code = this.code;

      // Stop listening before Firebase removes membership.
      this.disconnect();

      try {
        await this.game.leaveRoom(code);
      } catch (e) {
        this.connect(code);
        throw e;
      }
    });
  }


async debugGameState(): Promise<void> {
  try {
    const result = await this.game.checkGameState(
      this.code
    );

    console.log('CARD GAME STATE CHECK:', result);
  } catch (error) {
    console.error('CARD GAME STATE CHECK FAILED:', error);
  }
}


  ngOnDestroy(): void {
    this.unsubscribeHand?.();
    this.unsubscribe?.();
  }
}
