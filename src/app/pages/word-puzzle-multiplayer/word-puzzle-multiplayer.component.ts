
import {
    Component,
    HostListener,
    OnDestroy,
    OnInit
  } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { FormsModule } from '@angular/forms';
  import { RouterLink } from '@angular/router';
  import { Unsubscribe } from 'firebase/database';
  
  import {
    MultiplayerWordService,
    MultiplayerRoom,
    Difficulty
  } from '../../services/multiplayer-word.service';
  
  import {
    WordSearchSolverService,
    WordMatch
  } from '../../services/word-search-solver.service';
  
  @Component({
    selector: 'app-word-puzzle-multiplayer',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './word-puzzle-multiplayer.component.html',
    styleUrls: ['./word-puzzle-multiplayer.component.css']
  })
  export class WordPuzzleMultiplayerComponent
    implements OnInit, OnDestroy {
  
    playerName = '';
    roomCodeInput = '';
    roomCode = '';
    difficulty: Difficulty = 'easy';
  
    room: MultiplayerRoom | null = null;
    myId = '';
  
    loading = false;
    submitting = false;
    errorMessage = '';
    successMessage = '';
  
    remainingSeconds = 300;
    selectedCells: number[] = [];
    foundCells = new Set<number>();
  
    isSelecting = false;
    showAnswers = false;
    selectedAnswer: string | null = null;
    allPossibleWords: WordMatch[] = [];
  
    private startCell = -1;
    private pointerId: number | null = null;
    private unsubscribeRoom: Unsubscribe | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private finishRequested = false;
    private dictionaryReady = false;
    private serverTimeOffset = 0;
    private readonly sessionKey = 'wordMultiplayerRoom';
  
    constructor(
      public multiplayer: MultiplayerWordService,
      private solver: WordSearchSolverService
    ) {}
  
    async ngOnInit(): Promise<void> {
      try {
        const user = await this.multiplayer.ensureSignedIn();
        this.myId = user.uid;
  
        // Restore the room after a browser refresh.
        const savedCode = sessionStorage.getItem(this.sessionKey);
  
        if (savedCode) {
          this.connectToRoom(savedCode);
        }
  
        try {
          await this.solver.loadDictionary();
          this.dictionaryReady = true;
          this.restoreFoundCells();
          this.loadAnswersIfFinished();
        } catch (error) {
          console.warn('Dictionary unavailable:', error);
        }
      } catch (error) {
        this.errorMessage = this.getError(error);
      }
    }
  
    get grid(): string[][] {
      return this.room?.grid ?? [];
    }
  
    get size(): number {
      return this.grid.length;
    }
  
    get players(): {
      id: string;
      name: string;
      score: number;
    }[] {
      if (!this.room) return [];
  
      return Object.entries(this.room.players || {}).map(
        ([id, player]) => ({
          id,
          name: player.name,
          score: player.score || 0
        })
      );
    }
  
    get myPlayer() {
      return this.room?.players?.[this.myId];
    }
  
    get myWords(): string[] {
      return Object.keys(this.myPlayer?.foundWords || {}).sort();
    }
  
    get isHost(): boolean {
      return this.room?.hostId === this.myId;
    }
  
    get canStart(): boolean {
      return !!this.room &&
        this.isHost &&
        this.room.status === 'waiting' &&
        this.players.length === 2;
    }
  
    get isPlaying(): boolean {
      return this.room?.status === 'playing' &&
        this.remainingSeconds > 0;
    }
  
    get isGameOver(): boolean {
      return this.room?.status === 'finished' ||
        (this.room?.status === 'playing' &&
         this.remainingSeconds === 0);
    }
  
    get formattedTime(): string {
      const minutes = Math.floor(this.remainingSeconds / 60);
      const seconds = this.remainingSeconds % 60;
  
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  
    get winnerMessage(): string {
      if (this.players.length < 2) return '';
  
      const sorted = [...this.players].sort(
        (a, b) => b.score - a.score
      );
  
      const first = sorted[0];
      const second = sorted[1];
  
      if (first.score === second.score) {
        return `It's a tie! Both players scored ${first.score} points.`;
      }
  
      return `${first.name} wins with ${first.score} points!`;
    }
  
    get answerWords(): string[] {
      return [...new Set(
        this.allPossibleWords.map(m => m.word)
      )].sort((a, b) =>
        b.length - a.length || a.localeCompare(b)
      );
    }
  
    private getError(error: unknown): string {
      return error instanceof Error
        ? error.message
        : 'Something went wrong. Please try again.';
    }
  
    async createRoom(): Promise<void> {
      if (!this.playerName.trim()) {
        this.errorMessage = 'Enter your name first.';
        return;
      }
  
      this.loading = true;
      this.errorMessage = '';
  
      try {
        const code = await this.multiplayer.createRoom(
          this.playerName.trim(),
          this.difficulty
        );
  
        this.connectToRoom(code);
      } catch (error) {
        this.errorMessage = this.getError(error);
      } finally {
        this.loading = false;
      }
    }
  
    async joinRoom(): Promise<void> {
      if (!this.playerName.trim()) {
        this.errorMessage = 'Enter your name first.';
        return;
      }
  
      const code = this.roomCodeInput.trim().toUpperCase();
  
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        this.errorMessage = 'Enter a valid six-character room code.';
        return;
      }
  
      this.loading = true;
      this.errorMessage = '';
  
      try {
        await this.multiplayer.joinRoom(
          code,
          this.playerName.trim()
        );
  
        this.connectToRoom(code);
      } catch (error) {
        this.errorMessage = this.getError(error);
      } finally {
        this.loading = false;
      }
    }
  
    private connectToRoom(code: string): void {
      this.unsubscribeRoom?.();
      this.stopTimer();
  
      this.roomCode = code;
      this.room = null;
      this.foundCells.clear();
      this.allPossibleWords = [];
      this.showAnswers = false;
      this.selectedAnswer = null;
      this.finishRequested = false;
      this.errorMessage = '';
  
      sessionStorage.setItem(this.sessionKey, code);
  
      this.unsubscribeRoom = this.multiplayer.subscribeToRoom(
        code,
        room => {
          if (!room) {
            this.leaveRoom();
            this.errorMessage = 'Room not found.';
            return;
          }
  
          if (!room.players?.[this.myId]) {
            this.leaveRoom();
            this.errorMessage = 'You are not a member of this room.';
            return;
          }
  
          this.room = room;
          this.updateTimer();
          this.restoreFoundCells();
          this.loadAnswersIfFinished();
        },
        error => {
          this.errorMessage = this.getError(error);
        }
      );
  
      this.timer = setInterval(() => this.updateTimer(), 250);
    }
  
    private restoreFoundCells(): void {
      if (!this.room || !this.dictionaryReady) return;
  
      const matches = this.solver.findAllWords(
        this.room.grid,
        3
      );
  
      const found = new Set(this.myWords);
      this.foundCells.clear();
  
      // Highlight all occurrences of already discovered words.
      for (const match of matches) {
        if (found.has(match.word)) {
          match.cells.forEach(c => this.foundCells.add(c));
        }
      }
    }
  
    private loadAnswersIfFinished(): void {
      if (
        !this.dictionaryReady ||
        !this.room ||
        !this.isGameOver
      ) return;
  
      if (this.allPossibleWords.length) return;
  
      this.allPossibleWords = this.solver.findAllWords(
        this.room.grid,
        3
      );
    }
  
    private updateTimer(): void {
      if (!this.room) return;
  
      this.remainingSeconds =
        this.multiplayer.getRemainingSeconds(this.room);
  
      if (
        this.room.status === 'playing' &&
        this.remainingSeconds === 0 &&
        !this.finishRequested
      ) {
        this.finishRequested = true;
  
        void this.multiplayer.finishGame(this.roomCode)
          .catch(error => {
            console.error('Finish game failed:', error);
            this.finishRequested = false;
          });
      }
    }
  
    async startGame(): Promise<void> {
      if (!this.canStart) return;
  
      this.loading = true;
      this.errorMessage = '';
  
      try {
        await this.multiplayer.startGame(this.roomCode);
      } catch (error) {
        this.errorMessage = this.getError(error);
      } finally {
        this.loading = false;
      }
    }
  
    startSelection(
      index: number,
      event: PointerEvent
    ): void {
      if (!this.isPlaying || this.submitting) return;
  
      event.preventDefault();
  
      this.isSelecting = true;
      this.startCell = index;
      this.pointerId = event.pointerId;
      this.selectedCells = [index];
  
      (event.currentTarget as HTMLElement)
        .setPointerCapture?.(event.pointerId);
    }
  
    onPointerMove(event: PointerEvent): void {
      if (
        !this.isSelecting ||
        this.pointerId !== event.pointerId
      ) return;
  
      const element = document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement | null;
  
      const cell = element?.closest(
        '[data-cell-index]'
      ) as HTMLElement | null;
  
      if (!cell) return;
  
      const index = Number(
        cell.getAttribute('data-cell-index')
      );
  
      if (Number.isInteger(index)) {
        this.selectedCells = this.getLineCells(
          this.startCell,
          index
        );
      }
    }
  
    @HostListener('document:pointerup', ['$event'])
    async endSelection(event: PointerEvent): Promise<void> {
      if (
        !this.isSelecting ||
        this.pointerId !== event.pointerId
      ) return;
  
      this.onPointerMove(event);
      const cells = [...this.selectedCells];
      this.cancelSelection();
  
      if (!this.isPlaying || cells.length < 3) return;
  
      this.submitting = true;
      this.errorMessage = '';
  
      try {
        const result = await this.multiplayer.submitWord(
          this.roomCode,
          cells
        );
  
        if (result.accepted) {
          cells.forEach(c => this.foundCells.add(c));
          this.successMessage =
            `+${result.points} points — ${result.word}`;
        } else {
          this.successMessage = 'Invalid or already discovered word.';
        }
      } catch (error) {
        this.errorMessage = this.getError(error);
      } finally {
        this.submitting = false;
      }
    }
  
    @HostListener('document:pointercancel')
    cancelSelection(): void {
      this.isSelecting = false;
      this.pointerId = null;
      this.startCell = -1;
      this.selectedCells = [];
    }
  
    private getLineCells(start: number, end: number): number[] {
      const sr = Math.floor(start / this.size);
      const sc = start % this.size;
      const er = Math.floor(end / this.size);
      const ec = end % this.size;
  
      const rd = er - sr;
      const cd = ec - sc;
  
      if (
        rd !== 0 &&
        cd !== 0 &&
        Math.abs(rd) !== Math.abs(cd)
      ) {
        return [start];
      }
  
      const dr = Math.sign(rd);
      const dc = Math.sign(cd);
      const length = Math.max(
        Math.abs(rd),
        Math.abs(cd)
      );
  
      return Array.from(
        { length: length + 1 },
        (_, i) => (sr + dr * i) * this.size + (sc + dc * i)
      );
    }
  
    isSelected(index: number): boolean {
      return this.selectedCells.includes(index);
    }
  
    isFound(index: number): boolean {
      return this.foundCells.has(index);
    }
  
    isAnswerCell(index: number): boolean {
      if (!this.showAnswers) return false;
  
      return this.allPossibleWords.some(match =>
        (!this.selectedAnswer ||
          match.word === this.selectedAnswer) &&
        match.cells.includes(index)
      );
    }
  
    toggleAnswers(): void {
      if (!this.isGameOver || !this.allPossibleWords.length) {
        return;
      }
  
      this.showAnswers = !this.showAnswers;
      this.selectedAnswer = null;
    }
  
    selectAnswer(word: string): void {
      this.selectedAnswer =
        this.selectedAnswer === word ? null : word;
    }
  
    async copyRoomCode(): Promise<void> {
      try {
        await navigator.clipboard.writeText(this.roomCode);
        this.successMessage = 'Room code copied!';
      } catch {
        this.errorMessage = 'Could not copy the room code.';
      }
    }
  
    leaveRoom(): void {
      this.unsubscribeRoom?.();
      this.unsubscribeRoom = null;
      this.stopTimer();
  
      sessionStorage.removeItem(this.sessionKey);
  
      this.room = null;
      this.roomCode = '';
      this.roomCodeInput = '';
      this.selectedCells = [];
      this.foundCells.clear();
      this.allPossibleWords = [];
      this.showAnswers = false;
      this.selectedAnswer = null;
      this.remainingSeconds = 300;
      this.finishRequested = false;
      this.successMessage = '';
    }
  
    private stopTimer(): void {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  
    ngOnDestroy(): void {
      this.unsubscribeRoom?.();
      this.stopTimer();
    }
  }
  