
import { Injectable } from '@angular/core';
import {
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

export interface CardPlayer {
  uid: string;
  name: string;
  joinedAt: number;
  totalScore: number;
}

export interface CardRoom {
  code: string;
  status: 'waiting' | 'ready' | 'dealing' | 'playing' | 'finished';
  hostId: string;
  createdAt: number;
  updatedAt?: number;
  players: Record<string, CardPlayer>;
  playerOrder?: string[];
  roundNumber?: number;
  startingPlayerId?: string;
  phase?: 'predicting' | 'playing';
  currentPlayerId?: string;
  predictions?: Record<string, number>;
}

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
import {
  getAuth,
  User
} from 'firebase/auth';


export interface PlayingCard {
  suit: 'H' | 'S' | 'D' | 'C';
  rank: string;
}

export interface PrivateCardHand {
  roundNumber: number;
  cards: PlayingCard[];
}

export interface DealRoundResponse {
  code: string;
  roundNumber: number;
  phase: 'predicting';
  currentPlayerId: string;
}

export interface PredictionResponse {
  code: string;
  roundNumber: number;
  prediction: number;
  phase: 'predicting' | 'playing';
  currentPlayerId: string;
}

@Injectable({
  providedIn: 'root'
})
export class CardGameService {
  private app = getApps().length
    ? getApp()
    : initializeApp(environment.firebase);
  private auth = getAuth(this.app);
  private db = getDatabase(this.app);

  private functions = getFunctions(this.app, 'us-central1');

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

  private normalizeCode(code: string): string {
    const normalized = code.trim().toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) {
      throw new Error('Invalid room code.');
    }

    return normalized;
  }

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


  async dealRound(code: string): Promise<DealRoundResponse> {
    await this.signIn();

    const fn = httpsCallable<
      { code: string },
      DealRoundResponse
    >(this.functions, 'dealCardRound');

    const result = await fn({
      code: this.normalizeCode(code)
    });

    return result.data;
  }

  async submitPrediction(
    code: string,
    prediction: number
  ): Promise<PredictionResponse> {
    await this.signIn();

    const fn = httpsCallable<
      { code: string; prediction: number },
      PredictionResponse
    >(this.functions, 'submitCardPrediction');

    const result = await fn({
      code: this.normalizeCode(code),
      prediction
    });

    return result.data;
  }

  watchMyHand(
    code: string,
    next: (hand: PrivateCardHand | null) => void,
    error: (message: string) => void
  ): Unsubscribe {
    const roomCode = this.normalizeCode(code);
    const uid = this.uid;

    if (!uid) {
      throw new Error('Sign in before watching your cards.');
    }

    return onValue(
      ref(this.db, `cardPrivateHands/${roomCode}/${uid}`),
      snapshot => {
        next(snapshot.val() as PrivateCardHand | null);
      },
      e => error(e.message)
    );
  }

  async joinRoom(
    code: string,
    name: string
  ): Promise<string> {

    await this.signIn();

    const roomCode = this.normalizeCode(code);

    const fn = httpsCallable<
      { code: string; playerName: string },
      JoinRoomResponse
    >(
      this.functions,
      'joinCardRoom'
    );

    const result = await fn({
      code: roomCode,
      playerName: name.trim()
    });

    return result.data.code;
  }

  async startGame(code: string): Promise<void> {
    await this.signIn();

    const roomCode = this.normalizeCode(code);

    const fn = httpsCallable<
      { code: string },
      StartGameResponse
    >(
      this.functions,
      'startCardGame'
    );

    const result = await fn({
      code: roomCode
    });

    if (result.data.status !== 'ready') {
      throw new Error('Unable to start card game.');
    }
  }

  async leaveRoom(code: string): Promise<void> {
    await this.signIn();

    const roomCode = this.normalizeCode(code);

    const fn = httpsCallable<
      { code: string },
      LeaveRoomResponse
    >(
      this.functions,
      'leaveCardRoom'
    );

    const result = await fn({
      code: roomCode
    });

    if (!result.data.left) {
      throw new Error('Unable to leave card room.');
    }
  }

  watchRoom(
    code: string,
    next: (room: CardRoom | null) => void,
    error: (message: string) => void
  ): Unsubscribe {

    const roomCode = this.normalizeCode(code);

    return onValue(
      ref(this.db, `cardRooms/${roomCode}`),
      snapshot => {
        next(snapshot.val() as CardRoom | null);
      },
      e => {
        error(e.message);
      }
    );
  }
}
