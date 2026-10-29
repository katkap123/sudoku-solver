
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
    const user = await this.ensureSignedIn();
    const playerName = this.validateName(name);

    if (!Object.prototype.hasOwnProperty.call(this.sizes, difficulty)) {
      throw new Error('Invalid difficulty.');
    }

    await this.loadDictionary();
    const grid = this.generateGrid(difficulty);

    for (let attempt = 0; attempt < 15; attempt++) {
      const code = this.makeCode();
      const createdAt = this.now();

      const room: MultiplayerRoom = {
        code,
        hostId: user.uid,
        status: 'waiting',
        difficulty,
        grid,
        players: {
          [user.uid]: {
            name: playerName,
            score: 0,
            foundWords: {}
          }
        },
        startedAt: null,
        endsAt: null,
        createdAt
      };

      const result = await runTransaction(
        ref(this.db, `wordRooms/${code}`),
        current => current === null ? room : undefined,
        { applyLocally: false }
      );

      if (result.committed) return code;
    }

    throw new Error('Unable to create a room. Try again.');
  }

  

  async joinRoom(
    code: string,
    name: string
  ): Promise<void> {
    const user = await this.ensureSignedIn();
    const roomCode = this.validateCode(code);
    const playerName = this.validateName(name);
  
    const roomReference = ref(
      this.db,
      `wordRooms/${roomCode}`
    );
  
    // Check whether the room exists.
    const snapshot = await get(roomReference);
  
    if (!snapshot.exists()) {
      throw new Error('Room not found. Check the room code.');
    }
  
    const room = snapshot.val() as MultiplayerRoom;
  
    if (room.players?.[user.uid]) {
      return;
    }
  
    if (room.status !== 'waiting') {
      throw new Error('Game has already started.');
    }
  
    if (Object.keys(room.players || {}).length >= 2) {
      throw new Error('Room already has two players.');
    }
  
    // Add only Player 2 instead of updating the entire room.
    const playerReference = ref(
      this.db,
      `wordRooms/${roomCode}/players/${user.uid}`
    );
  
    await set(playerReference, {
      name: playerName,
      score: 0,
      foundWords: {}
    });
  
    console.log('Player joined successfully:', roomCode);
  }
  
  

  async startGame(code: string): Promise<void> {
    const user = await this.ensureSignedIn();
    const roomCode = this.validateCode(code);
    const target = ref(this.db, `wordRooms/${roomCode}`);
    await get(target);
    const result = await runTransaction(
      ref(this.db, `wordRooms/${roomCode}`),
      (room: MultiplayerRoom | null) => {
        if (!room) return;
        if (room.hostId !== user.uid) return;
        if (room.status !== 'waiting') return;

        if (Object.keys(room.players || {}).length !== 2) {
          return;
        }

        const start = this.now();

        room.status = 'playing';
        room.startedAt = start;
        room.endsAt = start + this.durationMs;

        return room;
      },
      { applyLocally: false }
    );

    if (!result.committed) {
      throw new Error(
        'Only the host can start a room with two players.'
      );
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
    const user = await this.ensureSignedIn();
    const roomCode = this.validateCode(code);

    await this.loadDictionary();

    const target = ref(this.db, `wordRooms/${roomCode}`);
    let acceptedWord = '';
    await get(target);
    const result = await runTransaction(
      target,
      (room: MultiplayerRoom | null) => {
        acceptedWord = '';

        if (!room || room.status !== 'playing') {
          return;
        }

        if (!room.endsAt || this.now() >= room.endsAt) {
          return;
        }

        const player = room.players?.[user.uid];
        if (!player) return;

        const word = this.wordFromCells(room.grid, cells);

        if (!word || !this.dictionary?.has(word)) {
          return;
        }

        if (player.foundWords?.[word]) {
          return;
        }

        if (!player.foundWords) {
          player.foundWords = {};
        }

        player.foundWords[word] = true;
        player.score = (player.score || 0) + word.length * 10;
        acceptedWord = word;

        return room;
      },
      { applyLocally: false }
    );

    if (!result.committed || !acceptedWord) {
      return {
        accepted: false,
        word: '',
        points: 0
      };
    }

    return {
      accepted: true,
      word: acceptedWord,
      points: acceptedWord.length * 10
    };
  }

  async finishGame(code: string): Promise<void> {
    const user = await this.ensureSignedIn();
    const roomCode = this.validateCode(code);
    const target = ref(this.db, `wordRooms/${roomCode}`);
    await get(target);
    const result = await runTransaction(
      ref(this.db, `wordRooms/${roomCode}`),
      (room: MultiplayerRoom | null) => {
        if (!room || !room.players?.[user.uid]) return;

        if (room.status === 'finished') return room;

        if (
          room.status !== 'playing' ||
          !room.endsAt ||
          this.now() < room.endsAt
        ) {
          return;
        }

        room.status = 'finished';
        return room;
      },
      { applyLocally: false }
    );

    if (!result.committed) {
      throw new Error('The game has not ended yet.');
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
