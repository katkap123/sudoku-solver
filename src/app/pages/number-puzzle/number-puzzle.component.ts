
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Difficulty = 'easy' | 'medium' | 'hard';

@Component({
  selector: 'app-number-puzzle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './number-puzzle.component.html',
  styleUrls: ['./number-puzzle.component.css']
})
export class NumberPuzzleComponent implements OnDestroy {

  difficulty: Difficulty = 'easy';

  tiles: number[] = [];
  initialTiles: number[] = [];

  moves = 0;
  elapsedSeconds = 0;
  gameStarted = false;
  gameCompleted = false;
  showGoal = false;

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.newGame();
  }

  get gridSize(): number {
    return {
      easy: 3,
      medium: 4,
      hard: 5
    }[this.difficulty];
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = this.elapsedSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  newGame(): void {
    this.stopTimer();

    const size = this.gridSize;
    const total = size * size;

    this.tiles = Array.from(
      { length: total },
      (_, i) => (i + 1) % total
    );

    // Shuffle by making legal moves from solved state.
    // This guarantees the generated puzzle is solvable.
    let emptyIndex = total - 1;
    let previousIndex = -1;

    const shuffleMoves = {
      easy: 60,
      medium: 120,
      hard: 200
    }[this.difficulty];

    for (let i = 0; i < shuffleMoves; i++) {
      let neighbors = this.getNeighbors(emptyIndex);

      // Avoid immediately reversing the previous shuffle move
      const filtered = neighbors.filter(
        index => index !== previousIndex
      );

      if (filtered.length > 0) {
        neighbors = filtered;
      }

      const randomIndex = neighbors[
        Math.floor(Math.random() * neighbors.length)
      ];

      this.swap(emptyIndex, randomIndex);

      previousIndex = emptyIndex;
      emptyIndex = randomIndex;
    }

    // Avoid presenting an already-solved board
    if (this.isSolved()) {
      const neighbor = this.getNeighbors(emptyIndex)[0];
      this.swap(emptyIndex, neighbor);
    }

    this.initialTiles = [...this.tiles];
    this.moves = 0;
    this.elapsedSeconds = 0;
    this.gameStarted = false;
    this.gameCompleted = false;
    this.showGoal = false;
  }

  moveTile(index: number): void {
    if (this.gameCompleted || this.showGoal) return;

    const emptyIndex = this.tiles.indexOf(0);

    if (!this.getNeighbors(emptyIndex).includes(index)) {
      return;
    }

    if (!this.gameStarted) {
      this.gameStarted = true;
      this.startTimer();
    }

    this.swap(index, emptyIndex);
    this.moves++;

    if (this.isSolved()) {
      this.gameCompleted = true;
      this.stopTimer();
    }
  }

  restartGame(): void {
    this.stopTimer();

    this.tiles = [...this.initialTiles];
    this.moves = 0;
    this.elapsedSeconds = 0;
    this.gameStarted = false;
    this.gameCompleted = false;
    this.showGoal = false;
  }

  private getNeighbors(index: number): number[] {
    const size = this.gridSize;
    const row = Math.floor(index / size);
    const col = index % size;

    const neighbors: number[] = [];

    if (row > 0) neighbors.push(index - size);
    if (row < size - 1) neighbors.push(index + size);
    if (col > 0) neighbors.push(index - 1);
    if (col < size - 1) neighbors.push(index + 1);

    return neighbors;
  }

  private swap(a: number, b: number): void {
    [this.tiles[a], this.tiles[b]] =
      [this.tiles[b], this.tiles[a]];
  }

  private isSolved(): boolean {
    const total = this.tiles.length;

    return this.tiles.every(
      (value, index) =>
        value === (index + 1) % total
    );
  }

  isCorrectPosition(index: number): boolean {
    return this.tiles[index] === index + 1;
  }

  toggleGoal(): void {
    this.showGoal = !this.showGoal;
  }

  private startTimer(): void {
    if (this.timerInterval !== null) return;

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }
}
