
import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  WordSearchSolverService,
  WordMatch
} from '../../services/word-search-solver.service';

type Difficulty = 'easy' | 'medium' | 'hard';

@Component({
  selector: 'app-word-puzzle-solo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './word-puzzle-solo.component.html',
  styleUrls: ['./word-puzzle-solo.component.css']
})
export class WordPuzzleSoloComponent implements OnDestroy {
  difficulty: Difficulty = 'easy';
  grid: string[][] = [];
  placements: WordMatch[] = [];
  allPossibleWords: WordMatch[] = [];

  foundWords = new Set<string>();
  foundCells = new Set<number>();
  selectedCells: number[] = [];

  showAnswers = false;
  selectedAnswer: string | null = null;
  isLoading = false;
  isSelecting = false;
  completed = false;
  errorMessage = '';
  elapsedSeconds = 0;
  minimumWordLength = 3;

  private startCell = -1;
  private pointerId: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private requestId = 0;
  private initialGrid: string[][] = [];

  private readonly directions: [number, number][] = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  constructor(
    private http: HttpClient,
    private solver: WordSearchSolverService
  ) {
    void this.newPuzzle();
  }

  get size(): number {
    return { easy: 8, medium: 10, hard: 12 }[this.difficulty];
  }

  get wordCount(): number {
    return { easy: 5, medium: 7, hard: 9 }[this.difficulty];
  }

  get formattedTime(): string {
    return `${String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0')}:${String(this.elapsedSeconds % 60).padStart(2, '0')}`;
  }

  get answerWords(): string[] {
    return [...new Set(this.allPossibleWords.map(m => m.word))]
      .sort((a, b) => b.length - a.length || a.localeCompare(b));
  }

  get totalUniqueWords(): number {
    return this.answerWords.length;
  }

  get progress(): number {
    return this.totalUniqueWords
      ? Math.round(this.foundWords.size / this.totalUniqueWords * 100)
      : 0;
  }

  get discoveredWords(): string[] {
    return [...this.foundWords].sort();
  }

  private async fetchRandomWords(): Promise<string[]> {
    const response = await firstValueFrom(
      this.http.get<string[]>(
        'https://random-word-api.herokuapp.com/word?number=150'
      )
    );

    return [...new Set(
      response.map(w => w.trim().toUpperCase())
        .filter(w =>
          /^[A-Z]+$/.test(w) &&
          w.length >= 4 &&
          w.length <= this.size &&
          this.solver.isValidWord(w)
        )
    )];
  }

  async newPuzzle(): Promise<void> {
    const request = ++this.requestId;
    this.stopTimer();
    this.resetState();
    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.solver.loadDictionary();
      const source = await this.fetchRandomWords();
      if (request !== this.requestId) return;

      if (source.length < this.wordCount) {
        throw new Error('Not enough valid words returned by API.');
      }

      let generated = false;

      for (let attempt = 0; attempt < 100; attempt++) {
        const board = Array.from(
          { length: this.size },
          () => Array<string>(this.size).fill('')
        );

        this.shuffle(source);
        const placed: WordMatch[] = [];
        let success = true;

        for (const word of source.slice(0, this.wordCount)) {
          const placement = this.placeWord(board, word);
          if (!placement) {
            success = false;
            break;
          }
          placed.push(placement);
        }

        if (!success) continue;

        this.fillEmptyCells(board);
        this.grid = board;
        this.placements = placed;
        this.initialGrid = board.map(row => [...row]);
        generated = true;
        break;
      }

      if (!generated) throw new Error('Could not generate puzzle.');

      this.scanWords();
      this.startTimer();
    } catch (error) {
      if (request !== this.requestId) return;
      console.error(error);
      this.errorMessage =
        'Could not generate the puzzle. Check your dictionary and internet connection.';
    } finally {
      if (request === this.requestId) this.isLoading = false;
    }
  }

  private scanWords(): void {
    this.allPossibleWords = this.solver.findAllWords(
      this.grid, this.minimumWordLength
    );

    for (const p of this.placements) {
      if (!this.allPossibleWords.some(m =>
        m.word === p.word &&
        this.sameCells(m.cells, p.cells)
      )) {
        this.allPossibleWords.push({
          word: p.word,
          cells: [...p.cells]
        });
      }
    }
  }

  private placeWord(board: string[][], word: string): WordMatch | null {
    for (let attempt = 0; attempt < 400; attempt++) {
      const [dr, dc] = this.directions[
        Math.floor(Math.random() * this.directions.length)
      ];
      const r = Math.floor(Math.random() * this.size);
      const c = Math.floor(Math.random() * this.size);
      const er = r + dr * (word.length - 1);
      const ec = c + dc * (word.length - 1);

      if (er < 0 || er >= this.size || ec < 0 || ec >= this.size) {
        continue;
      }

      const cells: number[] = [];
      let valid = true;

      for (let i = 0; i < word.length; i++) {
        const rr = r + dr * i;
        const cc = c + dc * i;
        if (board[rr][cc] && board[rr][cc] !== word[i]) {
          valid = false;
          break;
        }
        cells.push(rr * this.size + cc);
      }

      if (!valid) continue;

      for (let i = 0; i < word.length; i++) {
        board[r + dr * i][c + dc * i] = word[i];
      }
      return { word, cells };
    }
    return null;
  }

  private fillEmptyCells(board: string[][]): void {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const row of board) {
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) {
          row[c] = letters[Math.floor(Math.random() * letters.length)];
        }
      }
    }
  }

  private shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private sameCells(a: number[], b: number[]): boolean {
    return a.length === b.length &&
      a.every((v, i) => v === b[i]);
  }

  startSelection(index: number, event: PointerEvent): void {
    if (this.isLoading || this.completed || this.showAnswers) return;
    event.preventDefault();
    this.isSelecting = true;
    this.pointerId = event.pointerId;
    this.startCell = index;
    this.selectedCells = [index];
    (event.currentTarget as HTMLElement)
      .setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isSelecting || event.pointerId !== this.pointerId) return;
    const element = document.elementFromPoint(
      event.clientX, event.clientY
    ) as HTMLElement | null;
    const cell = element?.closest('[data-cell-index]') as HTMLElement | null;
    if (!cell) return;
    const index = Number(cell.getAttribute('data-cell-index'));
    if (Number.isInteger(index)) {
      this.selectedCells = this.getLineCells(this.startCell, index);
    }
  }

  @HostListener('document:pointerup', ['$event'])
  endSelection(event: PointerEvent): void {
    if (!this.isSelecting || event.pointerId !== this.pointerId) return;
    this.onPointerMove(event);
    const selection = [...this.selectedCells];
    this.cancelSelection();

    const match = this.allPossibleWords.find(m =>
      !this.foundWords.has(m.word) &&
      (this.sameCells(m.cells, selection) ||
       this.sameCells(m.cells, [...selection].reverse()))
    );

    if (!match) return;

    this.foundWords.add(match.word);
    selection.forEach(cell => this.foundCells.add(cell));

    if (this.foundWords.size === this.totalUniqueWords) {
      this.completed = true;
      this.stopTimer();
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

    if (rd !== 0 && cd !== 0 && Math.abs(rd) !== Math.abs(cd)) {
      return [start];
    }

    const dr = Math.sign(rd);
    const dc = Math.sign(cd);
    const length = Math.max(Math.abs(rd), Math.abs(cd));

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
    return this.allPossibleWords.some(m =>
      (!this.selectedAnswer || m.word === this.selectedAnswer) &&
      m.cells.includes(index)
    );
  }

  toggleAnswers(): void {
    this.showAnswers = !this.showAnswers;
    this.selectedAnswer = null;
  }

  selectAnswer(word: string): void {
    this.selectedAnswer =
      this.selectedAnswer === word ? null : word;
  }

  restartPuzzle(): void {
    if (!this.initialGrid.length || this.isLoading) return;
    this.stopTimer();
    this.grid = this.initialGrid.map(row => [...row]);
    this.foundWords.clear();
    this.foundCells.clear();
    this.cancelSelection();
    this.showAnswers = false;
    this.selectedAnswer = null;
    this.completed = false;
    this.elapsedSeconds = 0;
    this.scanWords();
    this.startTimer();
  }

  private resetState(): void {
    this.grid = [];
    this.placements = [];
    this.allPossibleWords = [];
    this.initialGrid = [];
    this.foundWords.clear();
    this.foundCells.clear();
    this.cancelSelection();
    this.showAnswers = false;
    this.selectedAnswer = null;
    this.completed = false;
    this.elapsedSeconds = 0;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (!this.completed) this.elapsedSeconds++;
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void {
    this.requestId++;
    this.stopTimer();
  }
}
