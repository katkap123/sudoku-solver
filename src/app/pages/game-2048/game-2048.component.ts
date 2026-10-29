
import {
  Component,
  HostListener,
  OnInit
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Inject, PLATFORM_ID } from '@angular/core';

type Direction = 'left' | 'right' | 'up' | 'down';

interface GameSnapshot {
  board: number[];
  score: number;
  won: boolean;
  gameOver: boolean;
}

@Component({
  selector: 'app-game-2048',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-2048.component.html',
  styleUrls: ['./game-2048.component.css']
})
export class Game2048Component implements OnInit {

  board: number[] = Array(16).fill(0);

  score = 0;
  bestScore = 0;

  won = false;
  keepPlaying = false;
  gameOver = false;

  previousState: GameSnapshot | null = null;

  private touchStartX = 0;
  private touchStartY = 0;

  private readonly storageKey = '2048-best-score';

  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      const stored = localStorage.getItem(this.storageKey);
      this.bestScore = Number(stored) || 0;
    }

    this.newGame();
  }

  newGame(): void {
    this.board = Array(16).fill(0);
    this.score = 0;
    this.won = false;
    this.keepPlaying = false;
    this.gameOver = false;
    this.previousState = null;

    this.addRandomTile();
    this.addRandomTile();
  }

  private addRandomTile(): void {
    const emptyCells = this.board
      .map((value, index) => value === 0 ? index : -1)
      .filter(index => index !== -1);

    if (emptyCells.length === 0) return;

    const randomIndex = emptyCells[
      Math.floor(Math.random() * emptyCells.length)
    ];

    this.board[randomIndex] = Math.random() < 0.9 ? 2 : 4;
  }

  move(direction: Direction): void {
    if (this.gameOver || (this.won && !this.keepPlaying)) {
      return;
    }

    const originalBoard = [...this.board];
    const originalScore = this.score;

    const newBoard = [...this.board];
    let gainedScore = 0;

    for (let line = 0; line < 4; line++) {
      const indices = this.getLineIndices(line, direction);

      const values = indices
        .map(index => originalBoard[index])
        .filter(value => value !== 0);

      const merged: number[] = [];

      for (let i = 0; i < values.length; i++) {
        if (
          i + 1 < values.length &&
          values[i] === values[i + 1]
        ) {
          const combined = values[i] * 2;

          merged.push(combined);
          gainedScore += combined;
          i++;
        } else {
          merged.push(values[i]);
        }
      }

      indices.forEach((index, position) => {
        newBoard[index] = merged[position] || 0;
      });
    }

    const changed = newBoard.some(
      (value, index) => value !== originalBoard[index]
    );

    // Invalid moves must not change score or create tiles.
    if (!changed) return;

    this.previousState = {
      board: originalBoard,
      score: originalScore,
      won: this.won,
      gameOver: this.gameOver
    };

    this.board = newBoard;
    this.score += gainedScore;

    this.updateBestScore();
    this.addRandomTile();

    if (!this.won && this.board.some(value => value >= 2048)) {
      this.won = true;
    }

    this.gameOver = !this.hasAvailableMoves();
  }

  private getLineIndices(
    line: number,
    direction: Direction
  ): number[] {
    const indices: number[] = [];

    for (let position = 0; position < 4; position++) {
      switch (direction) {
        case 'left':
          indices.push(line * 4 + position);
          break;
        case 'right':
          indices.push(line * 4 + (3 - position));
          break;
        case 'up':
          indices.push(position * 4 + line);
          break;
        case 'down':
          indices.push((3 - position) * 4 + line);
          break;
      }
    }

    return indices;
  }

  private hasAvailableMoves(): boolean {
    if (this.board.includes(0)) return true;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const index = row * 4 + col;

        if (
          col < 3 &&
          this.board[index] === this.board[index + 1]
        ) {
          return true;
        }

        if (
          row < 3 &&
          this.board[index] === this.board[index + 4]
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private updateBestScore(): void {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;

      if (this.isBrowser) {
        localStorage.setItem(
          this.storageKey,
          String(this.bestScore)
        );
      }
    }
  }

  undo(): void {
    if (!this.previousState) return;

    this.board = [...this.previousState.board];
    this.score = this.previousState.score;
    this.won = this.previousState.won;
    this.gameOver = this.previousState.gameOver;

    this.previousState = null;

    // Best score is intentionally not reduced.
  }

  continueGame(): void {
    this.keepPlaying = true;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const directionMap: Record<string, Direction> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down'
    };

    const direction = directionMap[event.key];

    if (!direction) return;

    const target = event.target as HTMLElement | null;

    if (
      target?.closest('input, textarea, select, button, [contenteditable="true"]')
    ) {
      return;
    }

    event.preventDefault();
    this.move(direction);
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0].screenX;
    this.touchStartY = event.changedTouches[0].screenY;
  }

  onTouchEnd(event: TouchEvent): void {
    const deltaX =
      event.changedTouches[0].screenX - this.touchStartX;

    const deltaY =
      event.changedTouches[0].screenY - this.touchStartY;

    const minimumSwipeDistance = 30;

    if (
      Math.max(Math.abs(deltaX), Math.abs(deltaY)) <
      minimumSwipeDistance
    ) {
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.move(deltaX > 0 ? 'right' : 'left');
    } else {
      this.move(deltaY > 0 ? 'down' : 'up');
    }
  }

  getTileClass(value: number): string {
    return value > 2048 ? 'tile-super' : `tile-${value}`;
  }
}
