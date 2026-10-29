
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Difficulty = 'easy' | 'medium' | 'hard';

interface MemoryCard {
  id: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

@Component({
  selector: 'app-memory-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './memory-game.component.html',
  styleUrls: ['./memory-game.component.css']
})
export class MemoryGameComponent implements OnDestroy {

  difficulty: Difficulty = 'easy';

  cards: MemoryCard[] = [];
  selectedCards: MemoryCard[] = [];

  moves = 0;
  matchedPairs = 0;
  elapsedSeconds = 0;

  gameStarted = false;
  gameCompleted = false;
  isChecking = false;

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private matchTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly symbols = [
    '🍎', '🚀', '🐶', '🌈', '⭐', '🦋',
    '🎮', '🍕', '🎨', '🐼', '🌸', '⚽'
  ];

  constructor() {
    this.newGame();
  }

  get totalPairs(): number {
    return this.cards.length / 2;
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = this.elapsedSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  get starRating(): number {
    if (!this.gameCompleted) return 0;

    const ratio = this.moves / this.totalPairs;

    if (ratio <= 1.5) return 3;
    if (ratio <= 2.5) return 2;
    return 1;
  }

  newGame(): void {
    this.stopTimer();
    this.clearMatchTimeout();

    this.moves = 0;
    this.matchedPairs = 0;
    this.elapsedSeconds = 0;

    this.gameStarted = false;
    this.gameCompleted = false;
    this.isChecking = false;
    this.selectedCards = [];

    const pairCount = {
      easy: 6,
      medium: 8,
      hard: 12
    }[this.difficulty];

    const selectedSymbols = this.symbols.slice(0, pairCount);

    this.cards = selectedSymbols.flatMap((symbol, index) => [
      {
        id: index * 2,
        symbol,
        flipped: false,
        matched: false
      },
      {
        id: index * 2 + 1,
        symbol,
        flipped: false,
        matched: false
      }
    ]);

    this.shuffleCards();
  }

  restartGame(): void {
    this.stopTimer();
    this.clearMatchTimeout();

    this.cards.forEach(card => {
      card.flipped = false;
      card.matched = false;
    });

    this.moves = 0;
    this.matchedPairs = 0;
    this.elapsedSeconds = 0;
    this.selectedCards = [];

    this.gameStarted = false;
    this.gameCompleted = false;
    this.isChecking = false;
  }

  flipCard(card: MemoryCard): void {
    if (
      card.flipped ||
      card.matched ||
      this.isChecking ||
      this.gameCompleted
    ) {
      return;
    }

    if (!this.gameStarted) {
      this.startTimer();
      this.gameStarted = true;
    }

    card.flipped = true;
    this.selectedCards.push(card);

    if (this.selectedCards.length === 2) {
      this.moves++;
      this.checkMatch();
    }
  }

  private checkMatch(): void {
    const [first, second] = this.selectedCards;

    if (first.symbol === second.symbol) {
      first.matched = true;
      second.matched = true;

      this.matchedPairs++;
      this.selectedCards = [];

      if (this.matchedPairs === this.totalPairs) {
        this.completeGame();
      }

    } else {
      this.isChecking = true;

      this.matchTimeout = setTimeout(() => {
        first.flipped = false;
        second.flipped = false;

        this.selectedCards = [];
        this.isChecking = false;
        this.matchTimeout = null;
      }, 900);
    }
  }

  private completeGame(): void {
    this.gameCompleted = true;
    this.stopTimer();
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

  private clearMatchTimeout(): void {
    if (this.matchTimeout !== null) {
      clearTimeout(this.matchTimeout);
      this.matchTimeout = null;
    }
  }

  private shuffleCards(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [this.cards[i], this.cards[j]] =
        [this.cards[j], this.cards[i]];
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.clearMatchTimeout();
  }
}
