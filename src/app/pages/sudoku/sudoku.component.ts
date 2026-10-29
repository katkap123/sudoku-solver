
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnDestroy } from '@angular/core';
import { createWorker, PSM } from 'tesseract.js';
interface SudokuMove {
  row: number;
  col: number;
  previousValue: string;
  newValue: string;
}
type SudokuAction = SudokuMove[];
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sudoku.component.html',
  styleUrls: ['./sudoku.component.css']
})

export class SudokuComponent implements OnDestroy {
  invalidCells: Set<string> = new Set();
  reviewingImportedPuzzle = false;
  validationMessage = '';
  board: string[][] = Array.from(
    { length: 9 },
    () => Array(9).fill('X')
  );
  undoStack: SudokuAction[] = [];
  redoStack: SudokuAction[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  isReadingImage = false;
  ocrProgress = 0;
  imageUploadError = '';

  async onSudokuImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.imageUploadError = 'Please select an image.';
      return;
    }

    this.isReadingImage = true;
    this.imageUploadError = '';
    this.ocrProgress = 0;

    try {
      const extractedBoard = await this.extractSudokuFromImage(file);

      this.board = extractedBoard;
      this.reviewingImportedPuzzle = true;
      this.lockedCells = Array.from(
        { length: 9 },
        () => Array(9).fill(false)
      );
      this.lockedCells = extractedBoard.map(
        row => row.map(cell => cell !== 'X')
      );
      this.originalCells = this.lockedCells.map(
        row => [...row]
      );

      this.isSolved = false;
      this.undoStack = [];
      this.redoStack = [];

      this.resetAndStartTimer();
      this.validateBoard();

      this.message = this.hasErrors
        ? 'Some numbers may be incorrect. Please review the highlighted cells.'
        : 'Sudoku imported! Review the numbers before solving.';

    } catch (error) {
      console.error('Sudoku OCR failed:', error);
      this.imageUploadError =
        'Unable to read this Sudoku image. Try a clearer screenshot.';
    } finally {
      this.isReadingImage = false;
      input.value = '';
    }
  }

  private async extractSudokuFromImage(
    file: File
  ): Promise<string[][]> {
    const image = await createImageBitmap(file);

    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas is unavailable.');
      }

      // Initial version assumes a tightly cropped, square
      // Sudoku grid with minimal surrounding content.
      const size = 900;
      canvas.width = size;
      canvas.height = size;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);

      const worker = await createWorker('eng');

      try {
        await worker.setParameters({
          tessedit_char_whitelist: '123456789',
          tessedit_pageseg_mode: PSM.SINGLE_CHAR
        });

        const board: string[][] = Array.from(
          { length: 9 },
          () => Array<string>(9).fill('X')
        );

        const cellSize = size / 9;
        const margin = 14;

        

      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {

          const cellCanvas = document.createElement('canvas');
          cellCanvas.width = 100;
          cellCanvas.height = 100;

          const cellContext = cellCanvas.getContext('2d', {
            willReadFrequently: true
          });

          if (!cellContext) continue;

          cellContext.fillStyle = '#ffffff';
          cellContext.fillRect(0, 0, 100, 100);

          // Remove grid borders from the extracted cell.
          const margin = cellSize * 0.15;

          cellContext.drawImage(
            canvas,
            col * cellSize + margin,
            row * cellSize + margin,
            cellSize - margin * 2,
            cellSize - margin * 2,
            12,
            12,
            76,
            76
          );

          // Convert to high-contrast black and white.
          const imageData = cellContext.getImageData(
            0, 0, 100, 100
          );

          const pixels = imageData.data;
          let darkPixels = 0;

          for (let i = 0; i < pixels.length; i += 4) {
            const gray =
              0.299 * pixels[i] +
              0.587 * pixels[i + 1] +
              0.114 * pixels[i + 2];

            const value = gray < 155 ? 0 : 255;

            pixels[i] = value;
            pixels[i + 1] = value;
            pixels[i + 2] = value;

            // Count dark pixels only in the interior.
            const pixelIndex = i / 4;
            const x = pixelIndex % 100;
            const y = Math.floor(pixelIndex / 100);

            if (
              x >= 12 && x < 88 &&
              y >= 12 && y < 88 &&
              value === 0
            ) {
              darkPixels++;
            }
          }

          cellContext.putImageData(imageData, 0, 0);

          // Skip cells that appear empty.
          if (darkPixels < 70) {
            board[row][col] = 'X';
          } else {
            const result = await worker.recognize(cellCanvas);

            const recognized = result.data.text.trim();
            const digit = recognized.match(/^[1-9]$/)?.[0];

            board[row][col] = digit || 'X';
          }

          this.ocrProgress = Math.round(
            ((row * 9 + col + 1) / 81) * 100
          );
        }
      }


        return board;
      } finally {
        await worker.terminate();
      }
    } finally {
      image.close();
    }
  }

  resetAndStartTimer(): void {
    this.resetTimer();  // Stops timer and sets elapsedSeconds to 0
    this.startTimer();  // Starts counting from 00:00
  }
difficulty: 'easy' | 'medium' | 'hard' = 'medium';

lockedCells: boolean[][] = Array.from(
  { length: 9 },
  () => Array(9).fill(false)
);

elapsedSeconds = 0;
timerRunning = false;
private timerInterval: ReturnType<typeof setInterval> | null = null;

get formattedTime(): string {
  const hours = Math.floor(this.elapsedSeconds / 3600);
  const minutes = Math.floor((this.elapsedSeconds % 3600) / 60);
  const seconds = this.elapsedSeconds % 60;

  const pad = (value: number) =>
    value.toString().padStart(2, '0');

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

startTimer(): void {
  if (this.timerRunning) return;

  this.timerRunning = true;

  this.timerInterval = setInterval(() => {
    this.elapsedSeconds++;
  }, 1000);
}

pauseTimer(): void {
  if (this.timerInterval !== null) {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  this.timerRunning = false;
}

resetTimer(): void {
  this.pauseTimer();
  this.elapsedSeconds = 0;
}

ngOnDestroy(): void {
  this.pauseTimer();
}


generateRandomSudoku(): void {
  // Create a solved Sudoku board
  this.resetTimer();
  this.startTimer();
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
  this.undoStack = [];
  this.redoStack = [];
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

    if (this.lockedCells[row][col] || this.isSolved) {
      input.value = this.board[row][col] === 'X'
        ? ''
        : this.board[row][col];
      return;
    }

    const value = input.value
      .toUpperCase()
      .replace(/[^1-9X]/g, '')
      .slice(-1) || 'X';

    const previousValue = this.board[row][col];

    if (previousValue !== value) {
      this.undoStack.push([{
        row,
        col,
        previousValue,
        newValue: value
      }]);

      // A new move invalidates the redo history
      this.redoStack = [];

      this.board[row][col] = value;
    }

    input.value = value === 'X' ? '' : value;

    this.message = '';
    this.validateBoard();
  }


  
  undo(): void {
    if (!this.canUndo || this.isSolved) return;

    const action = this.undoStack.pop()!;

    for (const move of action) {
      this.board[move.row][move.col] = move.previousValue;
    }

    this.redoStack.push(action);
    this.message = '';
    this.validateBoard();
  }

  redo(): void {
    if (!this.canRedo || this.isSolved) return;

    const action = this.redoStack.pop()!;

    for (const move of action) {
      this.board[move.row][move.col] = move.newValue;
    }

    this.undoStack.push(action);
    this.message = '';
    this.validateBoard();
  }

  clearBoard(): void {
    const clearedMoves: SudokuMove[] = [];

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {

        if (!this.lockedCells[row][col] &&
            this.board[row][col] !== 'X') {

          clearedMoves.push({
            row,
            col,
            previousValue: this.board[row][col],
            newValue: 'X'
          });

          this.board[row][col] = 'X';
        }
      }
    }

    if (clearedMoves.length > 0) {
      this.undoStack.push(clearedMoves);
      this.redoStack = [];
    }

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
      this.pauseTimer();
    
      this.message = `Sudoku solved in ${this.formattedTime}!`;
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

  loadExample(): void {
    this.resetTimer();
    this.startTimer();
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
    this.undoStack = [];
    this.redoStack = [];
  }

  trackByIndex(index: number): number {
    return index;
  }
  confirmImportedPuzzle(): void {
    this.validateBoard();
  
    if (this.hasErrors) {
      this.message =
        'Please correct the highlighted duplicate numbers first.';
      return;
    }
  
    this.lockedCells = this.board.map(
      row => row.map(cell => cell !== 'X')
    );
  
    this.originalCells = this.lockedCells.map(
      row => [...row]
    );
  
    this.reviewingImportedPuzzle = false;
    this.undoStack = [];
    this.redoStack = [];
    this.message = 'Sudoku confirmed. Ready to solve!';
  }
}
