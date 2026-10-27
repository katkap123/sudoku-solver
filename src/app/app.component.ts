
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  invalidCells: Set<string> = new Set();
  validationMessage = '';
  board: string[][] = Array.from(
    { length: 9 },
    () => Array(9).fill('X')
  );
  
difficulty: 'easy' | 'medium' | 'hard' = 'medium';

lockedCells: boolean[][] = Array.from(
  { length: 9 },
  () => Array(9).fill(false)
);

generateRandomSudoku(): void {
  // Create a solved Sudoku board
  const solution: string[][] = Array.from(
    { length: 9 },
    () => Array(9).fill('X')
  );

  if (!this.generateSolution(solution)) {
    this.message = 'Unable to generate Sudoku.';
    return;
  }

  const puzzle = solution.map(row => [...row]);

  // Number of cells to remove based on difficulty
  const emptyCells = {
    easy: 35,
    medium: 45,
    hard: 55
  };

  let removed = 0;
  const target = emptyCells[this.difficulty];

  // Randomly choose positions to remove
  const positions = Array.from(
    { length: 81 },
    (_, index) => index
  );

  this.shuffle(positions);

  for (const position of positions) {
    if (removed >= target) break;

    const row = Math.floor(position / 9);
    const col = position % 9;

    puzzle[row][col] = 'X';
    removed++;
  }

  this.board = puzzle;

  // Lock all given numbers
  this.lockedCells = this.board.map(
    row => row.map(cell => cell !== 'X')
  );

  this.originalCells = this.lockedCells.map(row => [...row]);

  this.isSolved = false;
  this.message = 'New Sudoku generated!';
  this.validateBoard();
}

// Generate a complete valid Sudoku solution
private generateSolution(board: string[][]): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {

      if (board[row][col] === 'X') {

        const numbers = [
          '1', '2', '3', '4', '5',
          '6', '7', '8', '9'
        ];

        this.shuffle(numbers);

        for (const num of numbers) {
          if (this.isValid(board, row, col, num)) {
            board[row][col] = num;

            if (this.generateSolution(board)) {
              return true;
            }

            board[row][col] = 'X';
          }
        }

        return false;
      }
    }
  }

  return true;
}

// Fisher-Yates shuffle
private shuffle<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }
}

  originalCells: boolean[][] = Array.from(
    { length: 9 },
    () => Array(9).fill(false)
  );

  message = '';
  isSolved = false;

  
  onCellInput(event: Event, row: number, col: number): void {
    const input = event.target as HTMLInputElement;
  
    if (this.lockedCells[row][col]) {
      input.value = this.board[row][col];
      return;
    }
  
    const value = input.value
      .toUpperCase()
      .replace(/[^1-9X]/g, '')
      .slice(-1);
  
    this.board[row][col] = value || 'X';
    input.value = value === 'X' ? '' : value;
  
    this.isSolved = false;
    this.message = '';
  
    this.validateBoard();
  }


  validateBoard(): void {
    this.invalidCells.clear();

    const markDuplicates = (
      cells: { row: number; col: number }[]
    ): void => {
      const seen = new Map<string, { row: number; col: number }[]>();

      for (const cell of cells) {
        const value = this.board[cell.row][cell.col];

        if (value === 'X') continue;

        const positions = seen.get(value) || [];
        positions.push(cell);
        seen.set(value, positions);
      }

      for (const positions of seen.values()) {
        if (positions.length > 1) {
          for (const cell of positions) {
            this.invalidCells.add(`${cell.row}-${cell.col}`);
          }
        }
      }
    };

    // Check each row
    for (let row = 0; row < 9; row++) {
      markDuplicates(
        Array.from({ length: 9 }, (_, col) => ({ row, col }))
      );
    }

    // Check each column
    for (let col = 0; col < 9; col++) {
      markDuplicates(
        Array.from({ length: 9 }, (_, row) => ({ row, col }))
      );
    }

    // Check each 3x3 box
    for (let boxRow = 0; boxRow < 9; boxRow += 3) {
      for (let boxCol = 0; boxCol < 9; boxCol += 3) {
        const cells = [];

        for (let r = boxRow; r < boxRow + 3; r++) {
          for (let c = boxCol; c < boxCol + 3; c++) {
            cells.push({ row: r, col: c });
          }
        }

        markDuplicates(cells);
      }
    }

    this.validationMessage = this.hasErrors
      ? 'Invalid Sudoku: duplicate numbers found.'
      : '';
  }

  isInvalidCell(row: number, col: number): boolean {
    return this.invalidCells.has(`${row}-${col}`);
  }



  get hasErrors(): boolean {
    return this.invalidCells.size > 0;
  }

  solveSudoku(): void {
    this.message = '';

    if (!this.isBoardValid()) {
      this.message = 'Invalid Sudoku: duplicate numbers found.';
      return;
    }

    this.originalCells = this.board.map(
      row => row.map(cell => cell !== 'X')
    );

    const copy = this.board.map(row => [...row]);

    if (this.solve(copy)) {
      this.board = copy;
      this.isSolved = true;
      this.message = 'Sudoku solved successfully!';
    } else {
      this.message = 'No solution exists for this Sudoku.';
    }
  }

  private solve(board: string[][]): boolean {

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {

        if (board[row][col] === 'X') {

          for (let num = 1; num <= 9; num++) {
            const value = num.toString();

            if (this.isValid(board, row, col, value)) {
              board[row][col] = value;

              if (this.solve(board)) {
                return true;
              }

              board[row][col] = 'X';
            }
          }

          return false;
        }
      }
    }

    return true;
  }

  private isValid(
    board: string[][],
    row: number,
    col: number,
    value: string
  ): boolean {

    for (let i = 0; i < 9; i++) {

      if (board[row][i] === value) return false;

      if (board[i][col] === value) return false;

      const boxRow = 3 * Math.floor(row / 3) + Math.floor(i / 3);
      const boxCol = 3 * Math.floor(col / 3) + i % 3;

      if (board[boxRow][boxCol] === value) return false;
    }

    return true;
  }

  private isBoardValid(): boolean {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const value = this.board[row][col];

        if (value === 'X') continue;

        this.board[row][col] = 'X';

        const valid = this.isValid(
          this.board, row, col, value
        );

        this.board[row][col] = value;

        if (!valid) return false;
      }
    }

    return true;
  }

  clearBoard(): void {
    this.board = Array.from(
      { length: 9 },
      () => Array(9).fill('X')
    );

    this.originalCells = Array.from(
      { length: 9 },
      () => Array(9).fill(false)
    );

    this.isSolved = false;
    this.message = '';
    this.lockedCells = Array.from(
      { length: 9 },
      () => Array(9).fill(false)
    );
    
    this.validateBoard();
  }

  loadExample(): void {
    const example = [
      '53XX7XXXX',
      '6XX195XXX',
      'X98XXXX6X',
      '8XXX6XXX3',
      '4XX8X3XX1',
      '7XXX2XXX6',
      'X6XXXX28X',
      'XXX419XX5',
      'XXXX8XX79'
    ];

    this.board = example.map(row => row.split(''));

    this.originalCells = this.board.map(
      row => row.map(cell => cell !== 'X')
    );

    this.isSolved = false;
    this.message = '';
    this.validateBoard();
    this.lockedCells = this.board.map(
      row => row.map(cell => cell !== 'X')
    );
  }

  trackByIndex(index: number): number {
    return index;
  }
}
