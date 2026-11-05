
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
    getFunctions,
    httpsCallable
  } from 'firebase/functions';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  User
} from 'firebase/auth';
import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    runTransaction,
    Unsubscribe
  } from 'firebase/database';

import { environment } from '../../environment/environment';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface MultiplayerPlayer {
  name: string;
  score: number;
  foundWords: Record<string, boolean>;
}

export interface MultiplayerRoom {
  code: string;
  hostId: string;
  status: GameStatus;
  difficulty: Difficulty;
  grid: string[][];
  players: Record<string, MultiplayerPlayer>;
  startedAt: number | null;
  endsAt: number | null;
  createdAt: number;
}

export interface SubmitWordResult {
  accepted: boolean;
  word: string;
  points: number;
}

@Injectable({ providedIn: 'root' })
export class MultiplayerWordService {
  private app = getApps().length
    ? getApp()
    : initializeApp(environment.firebase);

  private auth = getAuth(this.app);
  private db = getDatabase(this.app);

  private functions = getFunctions(this.app, 'us-central1');
  private readonly durationMs = 300000;
  private readonly letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private readonly dictionaryUrl =
    'assets/dictionaries/words.txt';

  private dictionary: Set<string> | null = null;
  private puzzleWords: string[] = [];
  private dictionaryPromise: Promise<void> | null = null;
  private serverOffsetMs = 0;

  private readonly sizes: Record<Difficulty, number> = {
    easy: 8,
    medium: 10,
    hard: 12
  };

  private readonly counts: Record<Difficulty, number> = {
    easy: 5,
    medium: 7,
    hard: 9
  };

  private readonly directions: [number, number][] = [
    [0, 1], [0, -1],
    [1, 0], [-1, 0],
    [1, 1], [1, -1],
    [-1, 1], [-1, -1]
  ];

  constructor(private http: HttpClient) {
    onValue(
      ref(this.db, '.info/serverTimeOffset'),
      snapshot => {
        this.serverOffsetMs = Number(snapshot.val()) || 0;
      }
    );
  }


    async leaveRoom(code: string): Promise<void> {
        await this.ensureSignedIn();
    
        const roomCode = this.validateCode(code);
    
        const leaveWordRoom = httpsCallable<
        { code: string },
        { left: boolean }
        >(this.functions, 'leaveWordRoom');
    
        const result = await leaveWordRoom({
        code: roomCode
        });
    
        if (!result.data.left) {
        throw new Error('Unable to leave the room.');
        }
    }  

  private now(): number {
    return Date.now() + this.serverOffsetMs;
  }

  async ensureSignedIn(): Promise<User> {
    await this.auth.authStateReady();

    if (this.auth.currentUser) {
      return this.auth.currentUser;
    }

    const credential = await signInAnonymously(this.auth);
    return credential.user;
  }

  get userId(): string {
    return this.auth.currentUser?.uid || '';
  }

  private async loadDictionary(): Promise<void> {
    if (this.dictionary) return;

    if (!this.dictionaryPromise) {
      this.dictionaryPromise = (async () => {
        const text = await firstValueFrom(
          this.http.get(this.dictionaryUrl, {
            responseType: 'text'
          })
        );

        const words = text
          .split(/\r?\n/)
          .map(word => word.trim().toUpperCase())
          .filter(word => /^[A-Z]{3,12}$/.test(word));

        this.dictionary = new Set(words);

        this.puzzleWords = words.filter(
          word => word.length >= 4 && word.length <= 7
        );
      })().catch(error => {
        this.dictionaryPromise = null;
        throw error;
      });
    }

    await this.dictionaryPromise;
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  private placeWord(
    grid: string[][],
    word: string
  ): boolean {
    const size = grid.length;

    for (let attempt = 0; attempt < 300; attempt++) {
      const [dr, dc] = this.directions[
        Math.floor(Math.random() * this.directions.length)
      ];

      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);

      const endR = r + dr * (word.length - 1);
      const endC = c + dc * (word.length - 1);

      if (
        endR < 0 || endR >= size ||
        endC < 0 || endC >= size
      ) {
        continue;
      }

      let fits = true;

      for (let i = 0; i < word.length; i++) {
        const existing = grid[r + dr * i][c + dc * i];

        if (existing && existing !== word[i]) {
          fits = false;
          break;
        }
      }

      if (!fits) continue;

      for (let i = 0; i < word.length; i++) {
        grid[r + dr * i][c + dc * i] = word[i];
      }

      return true;
    }

    return false;
  }

  private generateGrid(difficulty: Difficulty): string[][] {
    const size = this.sizes[difficulty];
    const count = this.counts[difficulty];

    for (let attempt = 0; attempt < 20; attempt++) {
      const grid = Array.from(
        { length: size },
        () => Array<string>(size).fill('')
      );

      let planted = 0;

      for (const word of this.shuffle(this.puzzleWords)) {
        if (word.length > size) continue;

        if (this.placeWord(grid, word)) {
          planted++;
        }

        if (planted === count) break;
      }

      if (planted !== count) continue;

      for (const row of grid) {
        for (let c = 0; c < size; c++) {
          if (!row[c]) {
            row[c] = this.letters[
              Math.floor(Math.random() * 26)
            ];
          }
        }
      }

      return grid;
    }

    throw new Error('Unable to generate a puzzle.');
  }

  private makeCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';

    for (let i = 0; i < 6; i++) {
      code += alphabet[
        Math.floor(Math.random() * alphabet.length)
      ];
    }

    return code;
  }

  private validateName(name: string): string {
    const cleaned = name.trim();

    if (!cleaned || cleaned.length > 24) {
      throw new Error('Name must contain 1–24 characters.');
    }

    return cleaned;
  }

  private validateCode(code: string): string {
    const cleaned = code.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(cleaned)) {
      throw new Error('Invalid six-character room code.');
    }

    return cleaned;
  }


  async createRoom(
    name: string,
    difficulty: Difficulty
  ): Promise<string> {
    await this.ensureSignedIn();
  
    const playerName = this.validateName(name);
  
    const createWordRoom = httpsCallable<
      { name: string; difficulty: Difficulty },
      { code: string }
    >(
      this.functions,
      'createWordRoom'
    );
  
    const result = await createWordRoom({
      name: playerName,
      difficulty
    });
  
    return result.data.code;
  }  

async joinRoom(
    code: string,
    name: string
  ): Promise<void> {
    await this.ensureSignedIn();
  
    const roomCode = this.validateCode(code);
    const playerName = this.validateName(name);
  
    const joinWordRoom = httpsCallable<
      { code: string; name: string },
      { code: string }
    >(this.functions, 'joinWordRoom');
  
    await joinWordRoom({
      code: roomCode,
      name: playerName
    });
  }
  
  
async startGame(code: string): Promise<void> {
    await this.ensureSignedIn();
  
    const roomCode = this.validateCode(code);
  
    const startWordGame = httpsCallable<
      { code: string },
      { started: boolean }
    >(this.functions, 'startWordGame');
  
    const result = await startWordGame({
      code: roomCode
    });
  
    if (!result.data.started) {
      throw new Error('Unable to start the game.');
    }
  }  

  private wordFromCells(
    grid: string[][],
    cells: number[]
  ): string | null {
    const size = grid.length;

    if (
      !Array.isArray(cells) ||
      cells.length < 3 ||
      cells.length > size
    ) {
      return null;
    }

    if (!cells.every(
      n => Number.isInteger(n) && n >= 0 && n < size * size
    )) {
      return null;
    }

    if (new Set(cells).size !== cells.length) {
      return null;
    }

    const coords = cells.map(
      n => [Math.floor(n / size), n % size]
    );

    const dr = coords[1][0] - coords[0][0];
    const dc = coords[1][1] - coords[0][1];

    if (
      Math.abs(dr) > 1 ||
      Math.abs(dc) > 1 ||
      (dr === 0 && dc === 0)
    ) {
      return null;
    }

    for (let i = 1; i < coords.length; i++) {
      if (
        coords[i][0] !== coords[0][0] + dr * i ||
        coords[i][1] !== coords[0][1] + dc * i
      ) {
        return null;
      }
    }

    return coords.map(
      ([r, c]) => grid[r][c]
    ).join('');
  }

  async submitWord(
    code: string,
    cells: number[]
  ): Promise<SubmitWordResult> {
    await this.ensureSignedIn();

    const roomCode = this.validateCode(code);

    const submitWordFunction = httpsCallable<
      { code: string; cells: number[] },
      SubmitWordResult
    >(this.functions, 'submitWord');

    const result = await submitWordFunction({
      code: roomCode,
      cells
    });

    return result.data;
  }
  
   
  async finishGame(code: string): Promise<void> {
    await this.ensureSignedIn();

    const roomCode = this.validateCode(code);

    const finishWordGame = httpsCallable<
      { code: string },
      { finished: boolean }
    >(this.functions, 'finishWordGame');

    const result = await finishWordGame({
      code: roomCode
    });

    if (!result.data.finished) {
      throw new Error('Unable to finish the game.');
    }
  }

  subscribeToRoom(
    code: string,
    callback: (room: MultiplayerRoom | null) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return onValue(
      ref(this.db, `wordRooms/${this.validateCode(code)}`),
      snapshot => {
        callback(
          snapshot.exists()
            ? snapshot.val() as MultiplayerRoom
            : null
        );
      },
      error => onError?.(error)
    );
  }

  getRemainingSeconds(room: MultiplayerRoom): number {
    if (room.status === 'waiting') return 300;
    if (room.status === 'finished') return 0;
    if (!room.endsAt) return 0;

    return Math.max(
      0,
      Math.ceil((room.endsAt - this.now()) / 1000)
    );
  }
}
