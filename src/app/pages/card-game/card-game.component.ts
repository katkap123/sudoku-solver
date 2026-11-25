import {
  Component,
  inject,
  OnDestroy,
  ChangeDetectorRef,
  NgZone
} from '@angular/core';

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
  styleUrls: ['./card-game.component.scss']
})

export class CardGameComponent implements OnDestroy {

  private game = inject(CardGameService);

  readonly maxRounds = 13;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  readonly trickCelebrationDurationMs = 4000;

  isTrickCelebrating = false;

  celebrationPlays: CardPlay[] = [];

  celebrationWinnerUid: string | null = null;

  celebrationTrickNumber = 0;

  celebrationRoundNumber = 0;

  celebrationPhase:
    'idle' | 'collecting' | 'celebrating' | 'clearing' = 'idle';

  private lastCelebratedTrickKey = '';

  private celebrationTimers:
    ReturnType<typeof setTimeout>[] = [];

  readonly scorecardRounds = Array.from(
    { length: this.maxRounds },
    (_, index) => index + 1
  );

  name = '';
  joinCode = '';
  code = '';

  room: CardRoom | null = null;
  hand: PrivateCardHand | null = null;

  busy = false;
  error = '';

  selectedPrediction = 0;

  private unsubscribe?: () => void;
  private unsubscribeHand?: () => void;

  // ------------------------------------------------
  // PLAYER AND ROOM INFORMATION
  // ------------------------------------------------

  get myId(): string {
    return this.game.uid;
  }

  get playerEntries():
    [string, CardRoom['players'][string]][] {

    return Object.entries(
      this.room?.players ?? {}
    );
  }

  get playerCount(): number {
    return this.playerEntries.length;
  }

  get scorecardPlayerIds(): string[] {
    return this.room?.playerOrder || [];
  }

  getHistoricalRoundScore(
    roundNumber: number,
    playerUid: string
  ): number | null {
  
    const score =
      this.room?.scoreHistory?.[
        String(roundNumber)
      ]?.[playerUid];
  
    return typeof score === 'number'
      ? score
      : null;
  }

  get celebrationWinnerName(): string {
    return this.celebrationWinnerUid
      ? this.getPlayerName(this.celebrationWinnerUid)
      : '';
  }
  
  get celebrationWinningCard(): PlayingCard | null {
    return this.celebrationPlays.find(
      play => play.uid === this.celebrationWinnerUid
    )?.card ?? null;
  }
  
  get celebrationWinningCardLabel(): string {
    const card = this.celebrationWinningCard;
  
    return card ? this.cardLabel(card) : '';
  }
  
  get isCelebrationWindowActive(): boolean {
    return (
      this.room?.trickCelebrationEndsAt ?? 0
    ) > Date.now();
  }
  
  get isCelebrationBlockingActions(): boolean {
    return (
      this.isTrickCelebrating ||
      this.isCelebrationWindowActive
    );
  }
  
  get displayTrickNumber(): number {
    return this.isTrickCelebrating
      ? this.celebrationTrickNumber
      : this.currentTrickNumber;
  }

  isCelebrationWinner(uid: string): boolean {
    return (
      this.isTrickCelebrating &&
      this.celebrationWinnerUid === uid
    );
  }
  
  getCelebrationCard(uid: string): PlayingCard | null {
    return this.celebrationPlays.find(
      play => play.uid === uid
    )?.card ?? null;
  }
  
  getCelebrationSeatIndex(uid: string): number {
    return this.tablePlayerOrder.indexOf(uid);
  }

  private scheduleCelebrationTimer(
    callback: () => void,
    delay: number
  ): void {
  
    const timer = setTimeout(() => {
  
      this.ngZone.run(() => {
  
        callback();
  
        this.cdr.markForCheck();
  
      });
  
    }, Math.max(0, delay));
  
    this.celebrationTimers.push(timer);
  }
  
  private clearCelebrationTimers(): void {
  
    for (const timer of this.celebrationTimers) {
      clearTimeout(timer);
    }
  
    this.celebrationTimers = [];
  }
  
  private finishTrickCelebration(): void {
  
    this.clearCelebrationTimers();
  
    this.isTrickCelebrating = false;
  
    this.celebrationPhase = 'idle';
  
    this.celebrationPlays = [];
  
    this.celebrationWinnerUid = null;
  
    this.celebrationTrickNumber = 0;
  
    this.celebrationRoundNumber = 0;
  
    this.cdr.markForCheck();
  }
  
  private resetTrickCelebration(): void {
  
    this.finishTrickCelebration();
  
    this.lastCelebratedTrickKey = '';
  }

  private syncTrickCelebration(
    room: CardRoom | null
  ): void {
  
    if (!room) {
  
      this.resetTrickCelebration();
  
      return;
    }
  
    const lastTrick = room.lastTrick;
  
    const endsAt =
      room.trickCelebrationEndsAt ?? 0;
  
    const remainingMs = endsAt - Date.now();
  
    // A new round invalidates the previous celebration.
    if (
      this.isTrickCelebrating &&
      this.celebrationRoundNumber !== room.roundNumber
    ) {
      this.finishTrickCelebration();
    }
  
    // A completed trick must contain four cards
    // and a valid winner.
    if (
      !lastTrick ||
      !lastTrick.plays ||
      lastTrick.plays.length !== 4 ||
      !lastTrick.winnerUid
    ) {
  
      if (this.isTrickCelebrating) {
        this.finishTrickCelebration();
      }
  
      return;
    }
  
    const trickKey = [
      room.code,
      room.roundNumber,
      lastTrick.trickNumber
    ].join(':');
  
    // Prevent duplicate celebrations.
    if (this.lastCelebratedTrickKey === trickKey) {
      return;
    }
  
    // Remember the trick even if its celebration
    // has already expired.
    this.lastCelebratedTrickKey = trickKey;
  
    // Do not replay old celebrations.
    if (remainingMs <= 0) {
  
      this.finishTrickCelebration();
  
      return;
    }
  
    this.clearCelebrationTimers();
  
    this.isTrickCelebrating = true;
  
    this.celebrationPlays = lastTrick.plays.map(
      play => ({
        uid: play.uid,
        card: { ...play.card }
      })
    );
  
    this.celebrationWinnerUid =
      lastTrick.winnerUid;
  
    this.celebrationTrickNumber =
      lastTrick.trickNumber;
  
    this.celebrationRoundNumber =
      room.roundNumber ?? 0;
  
    const elapsedMs = Math.max(
      0,
      this.trickCelebrationDurationMs - remainingMs
    );
  
    // Determine the current animation phase.
    if (elapsedMs < 800) {
  
      this.celebrationPhase = 'collecting';
  
    } else if (elapsedMs < 3300) {
  
      this.celebrationPhase = 'celebrating';
  
    } else {
  
      this.celebrationPhase = 'clearing';
  
    }
  
    // Phase 1 -> Phase 2:
    // All four cards reach the center.
    if (elapsedMs < 800) {
  
      this.scheduleCelebrationTimer(() => {
  
        this.celebrationPhase = 'celebrating';
  
      }, 800 - elapsedMs);
  
    }
  
    // Phase 2 -> Phase 3:
    // Cards move toward the winner.
    if (elapsedMs < 3300) {
  
      this.scheduleCelebrationTimer(() => {
  
        this.celebrationPhase = 'clearing';
  
      }, 3300 - elapsedMs);
  
    }
  
    // Finish the celebration.
    this.scheduleCelebrationTimer(() => {
  
      this.finishTrickCelebration();
  
    }, remainingMs);
  
    this.cdr.markForCheck();
  }

  getScorecardTotal(playerUid: string): number {
    return this.scorecardRounds.reduce(
      (total, roundNumber) => {
        const score = this.getHistoricalRoundScore(
          roundNumber,
          playerUid
        );
  
        return total + (score ?? 0);
      },
      0
    );
  }

  get scorecardHighestTotal(): number {
    return Math.max(
      0,
      ...this.scorecardPlayerIds.map(
        uid => this.getScorecardTotal(uid)
      )
    );
  }

  get showMultiplayerLobby(): boolean {
    return this.room?.status === 'waiting';
  }

  isScorecardLeader(playerUid: string): boolean {
    const total = this.getScorecardTotal(playerUid);
  
    return (
      total > 0 &&
      total === this.scorecardHighestTotal
    );
  }

  isScorecardRoundComplete(
    roundNumber: number
  ): boolean {
  
    const playerIds = this.scorecardPlayerIds;
  
    return (
      playerIds.length === 4 &&
      playerIds.every(
        uid =>
          this.getHistoricalRoundScore(
            roundNumber,
            uid
          ) !== null
      )
    );
  }

  get isHost(): boolean {
    return !!this.room &&
      this.room.hostId === this.myId;
  }

  get canStart(): boolean {
    return this.isHost &&
      this.room?.status === 'waiting' &&
      this.playerCount === 4 &&
      !this.busy;
  }

  get isReady(): boolean {
    return this.room?.status === 'ready';
  }

  get orderedPlayers(): string[] {
    return (this.room?.playerOrder ?? [])
      .map(uid => this.getPlayerName(uid));
  }

  get currentRoundNumber(): number {
    return this.room?.roundNumber ?? 0;
  }

  get nextRoundNumber(): number {
    return this.currentRoundNumber + 1;
  }

  // ------------------------------------------------
  // GAME PHASE
  // ------------------------------------------------

  get isPredicting(): boolean {
    return this.room?.status === 'playing' &&
      this.room?.phase === 'predicting';
  }

  get isPlaying(): boolean {
    return this.room?.status === 'playing' &&
      this.room?.phase === 'playing';
  }

  get isRoundComplete(): boolean {
    return this.room?.phase === 'round-complete';
  }

  get isGameComplete(): boolean {
    return this.room?.status === 'finished' &&
      this.room?.phase === 'game-complete';
  }

  get isMyTurn(): boolean {
    return this.isPredicting &&
      this.room?.currentPlayerId === this.myId;
  }

  get isMyPlayTurn(): boolean {
    if (this.isCelebrationBlockingActions) {
      return false;
    }
    return this.isPlaying &&
      this.room?.currentPlayerId === this.myId;
  }

  get currentPlayerName(): string {
    const uid =
      this.room?.currentPlayerId ?? '';

    return this.getPlayerName(uid);
  }

  // ------------------------------------------------
  // ROUND MANAGEMENT
  // ------------------------------------------------

  get canDealNextRound(): boolean {

    if (this.isCelebrationBlockingActions) {
      return false;
    }

    if (
      !this.room ||
      !this.isHost ||
      this.busy ||
      this.isGameComplete
    ) {
      return false;
    }

    if (
      this.isReady &&
      this.currentRoundNumber === 0
    ) {
      return true;
    }

    return this.isRoundComplete &&
      this.currentRoundNumber >= 1 &&
      this.currentRoundNumber < this.maxRounds;
  }

  get canRecoverGame(): boolean {
    return !!this.room &&
      !this.busy &&
      (
        this.room.status === 'ready' ||
        this.room.status === 'playing' ||
        this.room.status === 'finished'
      );
  }

  deal(): void {

    if (this.isCelebrationBlockingActions) {
      return;
    }

    if (!this.canDealNextRound) {
      return;
    }

    const roundNumber =
      this.nextRoundNumber;

    void this.execute(async () => {

      const result =
        await this.game.dealRound(
          this.code,
          roundNumber
        );

      console.log(
        'DEAL ROUND RESULT:',
        result
      );
    });
  }

  // ------------------------------------------------
  // PRIVATE HAND SYNCHRONIZATION
  // ------------------------------------------------

  get isHandSynchronized(): boolean {

    if (!this.hand || !this.room) {
      return false;
    }

    return (
      this.hand.roundNumber ===
        this.room.roundNumber &&
      (this.hand.revision ?? 0) ===
        (this.room.revision ?? 0)
    );
  }

  get myCards(): PlayingCard[] {

    if (
      !this.hand ||
      this.hand.roundNumber !==
        this.room?.roundNumber
    ) {
      return [];
    }

    return this.hand.cards ?? [];
  }

  // ------------------------------------------------
  // PREDICTIONS
  // ------------------------------------------------

  get roundPlayerOrder(): string[] {

    const publishedOrder =
      this.room?.roundPlayerOrder;

    if (publishedOrder?.length === 4) {
      return publishedOrder;
    }

    const order =
      this.room?.playerOrder ?? [];

    if (
      order.length !== 4 ||
      this.currentRoundNumber < 1
    ) {
      return order;
    }

    const startingIndex =
      (this.currentRoundNumber - 1) %
      order.length;

    return [
      ...order.slice(startingIndex),
      ...order.slice(0, startingIndex)
    ];
  }

  get myPrediction(): number | undefined {
    return this.room?.predictions?.[this.myId];
  }

  get availablePredictions(): number[] {

    const round =
      this.currentRoundNumber;

    if (!this.isMyTurn || round < 1) {
      return [];
    }

    const values = Array.from(
      { length: round + 1 },
      (_, index) => index
    );

    // Use rotating round order instead of
    // the original seating order.
    const order =
      this.roundPlayerOrder;

    if (order.length !== 4) {
      return [];
    }

    const isLastBidder =
      order[order.length - 1] === this.myId;

    if (!isLastBidder) {
      return values;
    }

    const previousPredictions =
      order.slice(0, 3).map(
        uid => this.room?.predictions?.[uid]
      );

    if (
      previousPredictions.some(
        value => value === undefined
      )
    ) {
      return [];
    }

    const previousTotal =
      previousPredictions.reduce<number>(
        (sum, value) =>
          sum + (value ?? 0),
        0
      );

    // The total predictions cannot equal
    // the current round number.
    return values.filter(
      value =>
        previousTotal + value !== round
    );
  }

  get canSubmitPrediction(): boolean {
    return this.isMyTurn &&
      !this.busy &&
      this.isHandSynchronized &&
      this.availablePredictions.includes(
        this.selectedPrediction
      );
  }

  predict(): void {

    if (!this.canSubmitPrediction) {
      return;
    }

    const roundNumber =
      this.currentRoundNumber;

    const prediction =
      this.selectedPrediction;

    void this.execute(async () => {

      const result =
        await this.game.submitPrediction(
          this.code,
          roundNumber,
          prediction
        );

      console.log(
        'PREDICTION RESULT:',
        result
      );
    });
  }

  // ------------------------------------------------
  // CARD DISPLAY
  // ------------------------------------------------

  cardLabel(card: PlayingCard): string {

    const symbols:
      Record<PlayingCard['suit'], string> = {
        H: '♥',
        S: '♠',
        D: '♦',
        C: '♣'
      };

    return `${card.rank}${symbols[card.suit]}`;
  }

  isRedCard(card: PlayingCard): boolean {
    return card.suit === 'H' ||
      card.suit === 'D';
  }

  // ------------------------------------------------
  // TRICK INFORMATION
  // ------------------------------------------------

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
    return this.currentTrickPlays[0]
      ?.card.suit ?? null;
  }

  get lastTrickWinner(): string {

    const uid =
      this.room?.lastTrick?.winnerUid;

    if (!uid) {
      return '';
    }

    return this.getPlayerName(uid);
  }

  // ------------------------------------------------
  // PLAY CARD
  // ------------------------------------------------

  canPlayCard(card: PlayingCard): boolean {

    if (this.isCelebrationBlockingActions) {
      return false;
    }
    if (
      !this.isMyPlayTurn ||
      this.busy ||
      this.isRoundComplete ||
      this.isGameComplete ||
      !this.isHandSynchronized
    ) {
      return false;
    }

    // Verify card ownership.
    const ownsCard = this.myCards.some(
      c =>
        c.suit === card.suit &&
        c.rank === card.rank
    );

    if (!ownsCard) {
      return false;
    }

    const leadSuit = this.leadSuit;

    // Any card can be used to lead a trick.
    if (!leadSuit) {
      return true;
    }

    const hasLeadSuit =
      this.myCards.some(
        c => c.suit === leadSuit
      );

    // Follow the lead suit if possible.
    if (hasLeadSuit) {
      return card.suit === leadSuit;
    }

    return true;
  }

  playCard(card: PlayingCard): void {

    if (this.isCelebrationBlockingActions) {
      return;
    }

    if (!this.canPlayCard(card)) {
      return;
    }

    const roundNumber =
      this.currentRoundNumber;

    void this.execute(async () => {

      const result =
        await this.game.playCard(
          this.code,
          roundNumber,
          card
        );

      console.log(
        'CARD PLAY RESULT:',
        result
      );
    });
  }

  // ------------------------------------------------
  // PLAYER STATISTICS
  // ------------------------------------------------

  get myTricksWon(): number {
    return this.getPlayerTricksWon(this.myId);
  }

  get myRoundScore(): number {
    return this.getPlayerRoundScore(this.myId);
  }

  get myTotalScore(): number {
    return this.getPlayerTotalScore(this.myId);
  }

  getPlayerName(uid: string): string {
    return this.room?.players?.[uid]
      ?.name ?? 'Unknown';
  }

  getPlayerPrediction(
    uid: string
  ): number | undefined {
    return this.room?.predictions?.[uid];
  }

  getPlayerTricksWon(uid: string): number {
    return this.room?.tricksWon?.[uid] ?? 0;
  }

  getPlayerRoundScore(uid: string): number {
    return this.room?.roundScores?.[uid] ?? 0;
  }

  getPlayerTotalScore(uid: string): number {
    return this.room?.players?.[uid]
      ?.totalScore ?? 0;
  }

  getPlayedCard(
    uid: string
  ): PlayingCard | null {

    return this.currentTrickPlays.find(
      play => play.uid === uid
    )?.card ?? null;
  }

  getLastPlayedCard(
    uid: string
  ): PlayingCard | null {

    return this.lastTrickPlays.find(
      play => play.uid === uid
    )?.card ?? null;
  }

  isCurrentPlayer(uid: string): boolean {

    return (
      this.isPredicting ||
      this.isPlaying
    ) &&
      this.room?.currentPlayerId === uid;
  }

  isLastTrickWinner(uid: string): boolean {
    return this.room?.lastTrick
      ?.winnerUid === uid;
  }

  // ------------------------------------------------
  // TABLE SEATING
  // ------------------------------------------------

  get tablePlayerOrder(): string[] {

    const order =
      this.room?.playerOrder ?? [];

    const myIndex =
      order.indexOf(this.myId);

    if (myIndex < 0) {
      return order;
    }

    // Keep the current player at the bottom
    // of the table for every round.
    return [
      ...order.slice(myIndex),
      ...order.slice(0, myIndex)
    ];
  }

  // ------------------------------------------------
  // FINAL GAME RESULTS
  // ------------------------------------------------

  get winnerIds(): string[] {
    return this.room?.winnerIds ?? [];
  }

  get winnerNames(): string[] {
    return this.winnerIds.map(
      uid => this.getPlayerName(uid)
    );
  }

  get highestScore(): number {
    return this.room?.highestScore ?? 0;
  }

  get isWinner(): boolean {
    return this.isGameComplete &&
      this.winnerIds.includes(this.myId);
  }

  get isTie(): boolean {
    return this.isGameComplete &&
      this.winnerIds.length > 1;
  }

  isGameWinner(uid: string): boolean {
    return this.isGameComplete &&
      this.winnerIds.includes(uid);
  }

  get leaderboard(): {
    rank: number;
    uid: string;
    name: string;
    totalScore: number;
    isWinner: boolean;
  }[] {

    const players = Object.values(
      this.room?.players ?? {}
    );

    const sorted = players.sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        a.name.localeCompare(b.name) ||
        a.uid.localeCompare(b.uid)
    );

    return sorted.map((player, index) => {

      // Players with identical scores
      // receive the same rank.
      const rank =
        sorted.findIndex(
          p => p.totalScore === player.totalScore
        ) + 1;

      return {
        rank: rank > 0 ? rank : index + 1,

        uid: player.uid,

        name: player.name,

        totalScore: player.totalScore,

        isWinner:
          this.isGameWinner(player.uid)
      };
    });
  }

  // ------------------------------------------------
  // GAME RECOVERY
  // ------------------------------------------------

  recoverGame(): void {

    if (!this.canRecoverGame) {
      return;
    }

    void this.execute(async () => {

      const result =
        await this.game.recoverGameState(
          this.code
        );

      console.log(
        'GAME RECOVERY RESULT:',
        result
      );
    });
  }

  // ------------------------------------------------
  // REALTIME DATABASE LISTENERS
  // ------------------------------------------------

  private connect(code: string): void {

    this.unsubscribe?.();
    this.unsubscribeHand?.();

    this.unsubscribe = undefined;
    this.unsubscribeHand = undefined;

    this.hand = null;
    this.room = null;

    this.selectedPrediction = 0;

    this.code = code;

    this.unsubscribe = this.game.watchRoom(
      code,

      room => {

        if (
          !room ||
          !room.players?.[this.myId]
        ) {
          this.disconnect();

          this.error =
            'Room closed or membership ended.';

          return;
        }

        const previousRound =
          this.room?.roundNumber ?? 0;

        this.room = room;
        this.syncTrickCelebration(this.room);

        const currentRound =
          room.roundNumber ?? 0;

        // Reset selected prediction when
        // entering a new round.
        if (previousRound !== currentRound) {
          this.selectedPrediction = 0;
        }

        // Start listening to the private hand.
        // Keep this listener across all 13 rounds.
        if (
          (
            room.status === 'playing' ||
            room.status === 'finished'
          ) &&
          !this.unsubscribeHand
        ) {

          this.unsubscribeHand =
            this.game.watchMyHand(
              code,

              hand => {
                this.hand = hand;
              },

              message => {
                this.error =
                  `Unable to load cards: ${message}`;
              }
            );
        }

        // Ensure the selected prediction
        // is valid for the current round.
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

    this.selectedPrediction = 0;

    this.code = '';
  }

  // ------------------------------------------------
  // COMMON ACTION EXECUTOR
  // ------------------------------------------------

  private async execute(
    action: () => Promise<void>
  ): Promise<void> {

    if (this.busy) {
      return;
    }

    this.busy = true;
    this.error = '';

    try {

      await action();

    } catch (e: unknown) {

      this.error =
        e instanceof Error
          ? e.message
          : 'Something went wrong.';

    } finally {

      this.busy = false;
    }
  }

  // ------------------------------------------------
  // LOBBY ACTIONS
  // ------------------------------------------------

  create(): void {

    void this.execute(async () => {

      const code =
        await this.game.createRoom(
          this.name
        );

      this.connect(code);
    });
  }

  join(): void {

    void this.execute(async () => {

      const code =
        await this.game.joinRoom(
          this.joinCode,
          this.name
        );

      this.connect(code);
    });
  }

  start(): void {

    if (!this.canStart) {
      return;
    }

    void this.execute(async () => {

      await this.game.startGame(
        this.code
      );
    });
  }

  async copyRoomCode(): Promise<void> {

    if (!this.code) {
      return;
    }

    try {

      await navigator.clipboard.writeText(
        this.code
      );

    } catch {

      this.error =
        'Unable to copy room code.';
    }
  }

  leave(): void {

    void this.execute(async () => {

      const code = this.code;

      this.disconnect();

      try {

        await this.game.leaveRoom(code);

      } catch (e) {

        this.connect(code);

        throw e;
      }
    });
  }

  // ------------------------------------------------
  // RETURN TO LOBBY AFTER GAME COMPLETION
  // ------------------------------------------------

  returnToLobby(): void {
    this.resetTrickCelebration();

    if (!this.isGameComplete || this.busy) {
      return;
    }

    this.disconnect();

    this.error = '';
    this.joinCode = '';
  }

  // ------------------------------------------------
  // GAME STATE DIAGNOSTIC
  // ------------------------------------------------

  async debugGameState(): Promise<void> {

    try {

      const result =
        await this.game.checkGameState(
          this.code
        );

      console.log(
        'CARD GAME STATE CHECK:',
        result
      );

    } catch (error) {

      console.error(
        'CARD GAME STATE CHECK FAILED:',
        error
      );
    }
  }

  // ------------------------------------------------
  // COMPONENT CLEANUP
  // ------------------------------------------------

  ngOnDestroy(): void {
    this.resetTrickCelebration();
    this.unsubscribeHand?.();
    this.unsubscribe?.();
  }
}
