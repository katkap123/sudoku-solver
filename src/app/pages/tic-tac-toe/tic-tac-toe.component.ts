
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Player = 'X' | 'O';
type Cell = Player | '';
type Difficulty = 'easy' | 'medium' | 'hard';
type GameMode = 'computer' | 'friend';

@Component({
  selector: 'app-tic-tac-toe',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tic-tac-toe.component.html',
  styleUrls: ['./tic-tac-toe.component.css']
})
export class TicTacToeComponent {

  board: Cell[] = Array(9).fill('');
  currentPlayer: Player = 'X';

  mode: GameMode = 'computer';
  difficulty: Difficulty = 'medium';

  winner: Player | 'draw' | null = null;
  winningCells: number[] = [];

  scores = { X: 0, O: 0, draw: 0 };

  readonly winningPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  get statusMessage(): string {
    if (this.winner === 'draw') return "It's a draw!";

    if (this.winner) {
      if (this.mode === 'computer' && this.winner === 'O') {
        return 'Computer wins!';
      }
      return `Player ${this.winner} wins!`;
    }

    return `Player ${this.currentPlayer}'s turn`;
  }

  makeMove(index: number): void {
    if (this.board[index] || this.winner) return;

    this.board[index] = this.currentPlayer;
    this.checkGameResult();

    if (this.winner) return;

    if (this.mode === 'computer') {
      this.currentPlayer = 'O';

      // Computer responds after the player's move.
      // No timer is needed for game correctness.
      this.computerMove();
    } else {
      this.currentPlayer =
        this.currentPlayer === 'X' ? 'O' : 'X';
    }
  }

  private computerMove(): void {
    const index = this.findComputerMove();

    if (index === -1) return;

    this.board[index] = 'O';
    this.checkGameResult();

    if (!this.winner) {
      this.currentPlayer = 'X';
    }
  }

  private findComputerMove(): number {
    const available = this.getAvailableMoves(this.board);

    if (available.length === 0) return -1;

    if (this.difficulty === 'easy') {
      return this.randomMove(available);
    }

    const winningMove = this.findWinningMove(this.board, 'O');
    if (winningMove !== -1) return winningMove;

    const blockingMove = this.findWinningMove(this.board, 'X');
    if (blockingMove !== -1) return blockingMove;

    if (this.difficulty === 'medium') {
      return this.randomMove(available);
    }

    // Hard: use minimax to find the optimal move
    return this.minimax([...this.board], 'O', 0).index;
  }

  private findWinningMove(board: Cell[], player: Player): number {
    for (const index of this.getAvailableMoves(board)) {
      const copy = [...board];
      copy[index] = player;

      if (this.getWinner(copy) === player) {
        return index;
      }
    }

    return -1;
  }

  private minimax(
    board: Cell[],
    player: Player,
    depth: number
  ): { score: number; index: number } {

    const winner = this.getWinner(board);

    if (winner === 'O') return { score: 10 - depth, index: -1 };
    if (winner === 'X') return { score: depth - 10, index: -1 };

    const available = this.getAvailableMoves(board);

    if (available.length === 0) {
      return { score: 0, index: -1 };
    }

    let bestScore = player === 'O'
      ? -Infinity
      : Infinity;

    let bestIndex = available[0];

    for (const index of available) {
      board[index] = player;

      const result = this.minimax(
        board,
        player === 'O' ? 'X' : 'O',
        depth + 1
      );

      board[index] = '';

      if (player === 'O' && result.score > bestScore) {
        bestScore = result.score;
        bestIndex = index;
      }

      if (player === 'X' && result.score < bestScore) {
        bestScore = result.score;
        bestIndex = index;
      }
    }

    return { score: bestScore, index: bestIndex };
  }

  private getWinner(board: Cell[]): Player | null {
    for (const pattern of this.winningPatterns) {
      const [a, b, c] = pattern;

      if (
        board[a] &&
        board[a] === board[b] &&
        board[b] === board[c]
      ) {
        return board[a] as Player;
      }
    }

    return null;
  }

  private checkGameResult(): void {
    const winningPattern = this.winningPatterns.find(
      ([a, b, c]) =>
        this.board[a] &&
        this.board[a] === this.board[b] &&
        this.board[b] === this.board[c]
    );

    if (winningPattern) {
      this.winner = this.board[winningPattern[0]] as Player;
      this.winningCells = winningPattern;
      this.scores[this.winner]++;
      return;
    }

    if (this.board.every(cell => cell !== '')) {
      this.winner = 'draw';
      this.scores.draw++;
    }
  }

  private getAvailableMoves(board: Cell[]): number[] {
    return board
      .map((cell, index) => cell === '' ? index : -1)
      .filter(index => index !== -1);
  }

  private randomMove(moves: number[]): number {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  newRound(): void {
    this.board = Array(9).fill('');
    this.currentPlayer = 'X';
    this.winner = null;
    this.winningCells = [];
  }

  resetScores(): void {
    this.scores = { X: 0, O: 0, draw: 0 };
    this.newRound();
  }

  changeMode(): void {
    this.resetScores();
  }

  changeDifficulty(): void {
    this.newRound();
  }

  isWinningCell(index: number): boolean {
    return this.winningCells.includes(index);
  }
}
