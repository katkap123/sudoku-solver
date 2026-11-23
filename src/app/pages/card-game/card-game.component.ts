
import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  CardGameService,
  CardRoom,
  PrivateCardHand,
  PlayingCard
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

  ngOnDestroy(): void {
    this.unsubscribeHand?.();
    this.unsubscribe?.();
  }
}
