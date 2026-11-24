
import { Injectable } from '@angular/core';

import {
  getAuth,
  signInAnonymously
} from 'firebase/auth';

import {
  getFunctions,
  httpsCallable
} from 'firebase/functions';

import {
  getApp,
  getApps,
  initializeApp
} from 'firebase/app';

import {
  getDatabase,
  ref,
  onValue,
  Unsubscribe
} from 'firebase/database';

import { environment } from '../../environment/environment';

// --------------------------------------------------
// GAME PHASE
// --------------------------------------------------

export type CardGamePhase =
  | 'predicting'
  | 'playing'
  | 'round-complete'
  | 'game-complete';

// --------------------------------------------------
// CARD INTERFACES
// --------------------------------------------------

export interface PlayingCard {
  suit: 'H' | 'S' | 'D' | 'C';
  rank: string;
}

export interface CardPlay {
  uid: string;
  card: PlayingCard;
}

export interface CardTrick {
  trickNumber: number;
  plays?: CardPlay[];
  winnerUid?: string;
}

export interface PrivateCardHand {
  roundNumber: number;
  cards: PlayingCard[];
  cardCount?: number;
  revision?: number;
}

// --------------------------------------------------
// PLAYER AND ROOM INTERFACES
// --------------------------------------------------

export interface CardPlayer {
  uid: string;
  name: string;
  joinedAt: number;
  totalScore: number;
}

export interface CardRoom {
  code: string;

  status:
    | 'waiting'
    | 'ready'
    | 'dealing'
    | 'playing'
    | 'finished';

  hostId: string;

  createdAt: number;
  updatedAt?: number;

  players: Record<string, CardPlayer>;

  // Original seating order.
  playerOrder?: string[];

  // Rotating prediction order for each round.
  roundPlayerOrder?: string[];

  roundNumber?: number;

  startingPlayerId?: string;

  phase?: CardGamePhase;

  currentPlayerId?: string | null;

  predictions?: Record<string, number>;

  // Trick information.
  trickNumber?: number;

  currentTrick?: CardTrick | null;

  lastTrick?: CardTrick | null;

  tricksWon?: Record<string, number>;

  roundScores?: Record<string, number>;

  // Final game results.
  winnerIds?: string[];

  highestScore?: number | null;

  finishedAt?: number | null;

  // Synchronization revision.
  revision?: number;
}

// --------------------------------------------------
// LOBBY RESPONSE INTERFACES
// --------------------------------------------------

interface CreateRoomResponse {
  code: string;
  roomCode: string;
  hostId: string;
  status: string;
}

interface JoinRoomResponse {
  code: string;
  roomCode: string;
  status: string;
  hostId: string;
  playerCount: number;
}

interface StartGameResponse {
  code: string;
  roomCode: string;
  status: 'ready';
  playerOrder: string[];
}

interface LeaveRoomResponse {
  code: string;
  roomCode: string;
  left: boolean;
}

// --------------------------------------------------
// GAME RESPONSE INTERFACES
// --------------------------------------------------

export interface DealRoundResponse {
  code: string;

  roundNumber: number;

  phase: CardGamePhase;

  currentPlayerId: string | null;

  revision: number;
}

export interface PredictionResponse {
  code: string;

  roundNumber: number;

  prediction: number;

  phase: CardGamePhase;

  currentPlayerId: string | null;

  revision: number;
}

export interface PlayCardResponse {
  code: string;

  card: PlayingCard;

  roundNumber: number;

  phase: CardGamePhase;

  trickNumber: number;

  currentPlayerId: string | null;

  currentTrick: CardTrick | null;

  lastTrick: CardTrick | null;

  tricksWon: Record<string, number>;

  roundScores: Record<string, number>;

  totalScores: Record<string, number>;

  // Final game information.
  gameComplete: boolean;

  winnerIds: string[];

  highestScore: number | null;

  finishedAt: number | null;

  completedTrickCount: number;

  revision: number;
}

// --------------------------------------------------
// RECOVERY RESPONSE
// --------------------------------------------------

export interface RecoverGameStateResponse {
  code: string;

  recovered: boolean;

  roundNumber: number;

  phase: CardGamePhase;

  currentPlayerId: string | null;

  revision: number;
}

// --------------------------------------------------
// DIAGNOSTIC RESPONSE
// --------------------------------------------------

export interface GameStateCheckResponse {
  code: string;

  roomStatus: CardRoom['status'];

  roomPhase: CardGamePhase;

  roomRoundNumber: number;

  statePhase: CardGamePhase;

  stateRoundNumber: number;

  playerCount: number;

  handCounts: Record<string, number>;

  startingPlayerId: string | null;

  currentPlayerId: string | null;

  playerOrder: string[];

  roundPlayerOrder: string[];

  trickNumber: number;

  completedTrickCount: number;

  totalScores: Record<string, number>;

  roomRevision: number;

  revision: number;

  consistent: boolean;
}

// --------------------------------------------------
// CARD GAME SERVICE
// --------------------------------------------------

@Injectable({
  providedIn: 'root'
})
export class CardGameService {

  private app = getApps().length
    ? getApp()
    : initializeApp(environment.firebase);

  private auth = getAuth(this.app);

  private db = getDatabase(this.app);

  private functions = getFunctions(
    this.app,
    'us-central1'
  );

  // ------------------------------------------------
  // AUTHENTICATION
  // ------------------------------------------------

  get uid(): string {
    return this.auth.currentUser?.uid ?? '';
  }

  async signIn(): Promise<string> {

    await this.auth.authStateReady();

    if (!this.auth.currentUser) {
      await signInAnonymously(this.auth);
    }

    return this.uid;
  }

  // ------------------------------------------------
  // VALIDATION
  // ------------------------------------------------

  private normalizeCode(code: string): string {

    const normalized =
      code.trim().toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) {
      throw new Error('Invalid room code.');
    }

    return normalized;
  }

  private validateRoundNumber(
    roundNumber: number
  ): number {

    if (
      !Number.isInteger(roundNumber) ||
      roundNumber < 1 ||
      roundNumber > 13
    ) {
      throw new Error(
        'Round number must be between 1 and 13.'
      );
    }

    return roundNumber;
  }

  // ------------------------------------------------
  // CREATE ROOM
  // ------------------------------------------------

  async createRoom(name: string): Promise<string> {

    await this.signIn();

    const fn = httpsCallable<
      { playerName: string },
      CreateRoomResponse
    >(
      this.functions,
      'createCardRoom'
    );

    const result = await fn({
      playerName: name.trim()
    });

    return result.data.code;
  }

  // ------------------------------------------------
  // JOIN ROOM
  // ------------------------------------------------

  async joinRoom(
    code: string,
    name: string
  ): Promise<string> {

    await this.signIn();

    const fn = httpsCallable<
      {
        code: string;
        playerName: string;
      },
      JoinRoomResponse
    >(
      this.functions,
      'joinCardRoom'
    );

    const result = await fn({
      code: this.normalizeCode(code),
      playerName: name.trim()
    });

    return result.data.code;
  }

  // ------------------------------------------------
  // START GAME
  // ------------------------------------------------

  async startGame(code: string): Promise<void> {

    await this.signIn();

    const fn = httpsCallable<
      { code: string },
      StartGameResponse
    >(
      this.functions,
      'startCardGame'
    );

    const result = await fn({
      code: this.normalizeCode(code)
    });

    if (result.data.status !== 'ready') {
      throw new Error(
        'Unable to start card game.'
      );
    }
  }

  // ------------------------------------------------
  // LEAVE ROOM
  // ------------------------------------------------

  async leaveRoom(code: string): Promise<void> {

    await this.signIn();

    const fn = httpsCallable<
      { code: string },
      LeaveRoomResponse
    >(
      this.functions,
      'leaveCardRoom'
    );

    const result = await fn({
      code: this.normalizeCode(code)
    });

    if (!result.data.left) {
      throw new Error(
        'Unable to leave card room.'
      );
    }
  }

  // ------------------------------------------------
  // DEAL ROUND — ROUNDS 1 TO 13
  // ------------------------------------------------

  async dealRound(
    code: string,
    roundNumber: number
  ): Promise<DealRoundResponse> {

    await this.signIn();

    const fn = httpsCallable<
      {
        code: string;
        roundNumber: number;
      },
      DealRoundResponse
    >(
      this.functions,
      'dealCardRound'
    );

    const result = await fn({
      code: this.normalizeCode(code),

      roundNumber:
        this.validateRoundNumber(roundNumber)
    });

    return result.data;
  }

  // ------------------------------------------------
  // SUBMIT PREDICTION
  // ------------------------------------------------

  async submitPrediction(
    code: string,
    roundNumber: number,
    prediction: number
  ): Promise<PredictionResponse> {

    await this.signIn();

    const validatedRound =
      this.validateRoundNumber(roundNumber);

    if (
      !Number.isInteger(prediction) ||
      prediction < 0 ||
      prediction > validatedRound
    ) {
      throw new Error(
        `Prediction must be between 0 and ${validatedRound}.`
      );
    }

    const fn = httpsCallable<
      {
        code: string;
        roundNumber: number;
        prediction: number;
      },
      PredictionResponse
    >(
      this.functions,
      'submitCardPrediction'
    );

    const result = await fn({
      code: this.normalizeCode(code),

      roundNumber: validatedRound,

      prediction
    });

    return result.data;
  }

  // ------------------------------------------------
  // PLAY CARD
  // ------------------------------------------------

  async playCard(
    code: string,
    roundNumber: number,
    card: PlayingCard
  ): Promise<PlayCardResponse> {

    await this.signIn();

    const fn = httpsCallable<
      {
        code: string;
        roundNumber: number;
        card: PlayingCard;
      },
      PlayCardResponse
    >(
      this.functions,
      'playCard'
    );

    const result = await fn({
      code: this.normalizeCode(code),

      roundNumber:
        this.validateRoundNumber(roundNumber),

      card: {
        suit: card.suit,
        rank: card.rank
      }
    });

    return result.data;
  }

  // ------------------------------------------------
  // RECOVER GAME STATE
  // ------------------------------------------------

  async recoverGameState(
    code: string
  ): Promise<RecoverGameStateResponse> {

    await this.signIn();

    const fn = httpsCallable<
      { code: string },
      RecoverGameStateResponse
    >(
      this.functions,
      'recoverCardGameState'
    );

    const result = await fn({
      code: this.normalizeCode(code)
    });

    return result.data;
  }

  // ------------------------------------------------
  // CHECK GAME STATE
  // ------------------------------------------------

  async checkGameState(
    code: string
  ): Promise<GameStateCheckResponse> {

    await this.signIn();

    const fn = httpsCallable<
      { code: string },
      GameStateCheckResponse
    >(
      this.functions,
      'checkCardGameState'
    );

    const result = await fn({
      code: this.normalizeCode(code)
    });

    return result.data;
  }

  // ------------------------------------------------
  // WATCH PRIVATE PLAYER HAND
  // ------------------------------------------------

  watchMyHand(
    code: string,
    next: (hand: PrivateCardHand | null) => void,
    error: (message: string) => void
  ): Unsubscribe {

    const roomCode = this.normalizeCode(code);

    const uid = this.uid;

    if (!uid) {
      throw new Error(
        'Sign in before watching your cards.'
      );
    }

    return onValue(
      ref(
        this.db,
        `cardPrivateHands/${roomCode}/${uid}`
      ),
      snapshot => {

        const data = snapshot.val();

        if (!data) {
          next(null);
          return;
        }

        const cards: PlayingCard[] =
          Array.isArray(data.cards)
            ? data.cards
            : [];

        next({
          roundNumber: data.roundNumber,

          cards,

          cardCount: cards.length,

          revision: data.revision ?? 0
        });
      },
      e => error(e.message)
    );
  }

  // ------------------------------------------------
  // WATCH PUBLIC ROOM
  // ------------------------------------------------

  watchRoom(
    code: string,
    next: (room: CardRoom | null) => void,
    error: (message: string) => void
  ): Unsubscribe {

    const roomCode = this.normalizeCode(code);

    return onValue(
      ref(
        this.db,
        `cardRooms/${roomCode}`
      ),
      snapshot => {

        const room =
          snapshot.val() as CardRoom | null;

        next(room);
      },
      e => error(e.message)
    );
  }
}
