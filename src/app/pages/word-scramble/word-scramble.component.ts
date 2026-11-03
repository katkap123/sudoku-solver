
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnDestroy, OnInit } from '@angular/core';

type Difficulty = 'easy' | 'medium' | 'hard';

@Component({
  selector: 'app-word-scramble',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './word-scramble.component.html',
  styleUrls: ['./word-scramble.component.css']
})
export class WordScrambleComponent implements OnInit, OnDestroy {
  difficulty: Difficulty = 'easy';
  currentWord = '';
  scrambledWord = '';
  hint = '';
  answer = '';
  message = '';

  score = 0;
  solvedCount = 0;
  elapsedSeconds = 0;
  gameOver = false;
  wordSolved = false;
  loading = true;

  level = 1;
  private readonly answersPerLevel = 3;
  private readonly maxLevel = 10;

  private dictionary: string[] = [];
  private usedWords = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  hintLevel = 0;
  hintPenalty = 0;
  readonly maxHints = 4;

  get possiblePoints(): number {
    return Math.max(0, this.level * 10 - this.hintPenalty);
  }

  // Keep compatibility with existing HTML.
  get totalWords(): number {
    return this.maxLevel * this.answersPerLevel;
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = this.elapsedSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  get levelProgress(): number {
    return this.solvedCount % this.answersPerLevel;
  }

  get wordLength(): number {
    return this.currentWord.length;
  }

  async ngOnInit(): Promise<void> {
    await this.loadDictionary();
    this.newGame();
  }

  onAnswerInput(value: string): void {
    const input = value.toUpperCase().replace(/[^A-Z]/g, '');

    const availableLetters = this.scrambledWord.split('');
    let validAnswer = '';

    for (const letter of input) {
      const index = availableLetters.indexOf(letter);

      if (index !== -1) {
        validAnswer += letter;

        // Remove used letter to prevent using it twice
        availableLetters.splice(index, 1);
      }
    }

    this.answer = validAnswer;
    this.message = '';
  }

  
  showHint(): void {
    if (
      this.wordSolved ||
      this.gameOver ||
      this.loading ||
      this.hintLevel >= this.maxHints
    ) {
      return;
    }

    this.hintLevel++;

    // First hint costs 1, second costs 2, etc.
    this.hintPenalty += this.hintLevel;

    switch (this.hintLevel) {
      case 1:
        this.hint =
          `Starts with "${this.currentWord[0]}"`;
        break;

      case 2:
        this.hint =
          `First two letters: "${this.currentWord.slice(0, 2)}"`;
        break;

      case 3:
        this.hint =
          `Ends with "${this.currentWord.slice(-2)}"`;
        break;

      case 4:
        this.hint =
          `First three letters: "${this.currentWord.slice(0, 3)}"`;
        break;
    }

    this.message =
      `Hint ${this.hintLevel}: -${this.hintLevel} points. ` +
      `${this.possiblePoints} points available.`;
  }


  private async loadDictionary(): Promise<void> {
    this.loading = true;

    try {
      const response = await fetch(
        'assets/dictionaries/words.txt'
      );

      if (!response.ok) {
        throw new Error('Dictionary could not be loaded');
      }

      const text = await response.text();

      this.dictionary = [...new Set(
        text
          .split(/\r?\n/)
          .map(word => word.trim().toUpperCase())
          .filter(word => /^[A-Z]{3,12}$/.test(word))
      )];

      if (this.dictionary.length === 0) {
        throw new Error('Dictionary is empty');
      }

    } catch (error) {
      console.error('Dictionary error:', error);

      // Fallback if the dictionary is unavailable.
      this.dictionary = [
        'CAT', 'DOG', 'SUN', 'BOOK', 'TREE',
        'FISH', 'APPLE', 'HOUSE', 'TRAIN',
        'WATER', 'GARDEN', 'PLANET', 'ORANGE',
        'PUZZLE', 'CASTLE', 'CAPTURE',
        'JOURNEY', 'DIAMOND', 'ELEPHANT',
        'COMPUTER', 'ADVENTURE',
        'BUTTERFLY', 'KNOWLEDGE',
        'CHALLENGING', 'EXPLORATION'
      ];
    } finally {
      this.loading = false;
    }
  }

  newGame(): void {
    this.stopTimer();

    this.score = 0;
    this.solvedCount = 0;
    this.elapsedSeconds = 0;
    this.level = 1;
    this.gameOver = false;
    this.wordSolved = false;
    this.answer = '';
    this.message = '';
    this.usedWords.clear();

    if (this.dictionary.length === 0) {
      this.message = 'No words available.';
      return;
    }

    this.nextWord();
    this.hintLevel = 0;
    this.hint = `${this.currentWord.length}-letter word`;
    this.timer = setInterval(() => {
      this.elapsedSeconds++;
    }, 1000);
  }


  private isValidAnagram(guess: string): boolean {
    if (guess.length !== this.currentWord.length) {
      return false;
    }

    if (!this.dictionary.includes(guess)) {
      return false;
    }

    const normalize = (word: string): string =>
      word.split('').sort().join('');

    return normalize(guess) ===
      normalize(this.currentWord);
  }

  private getLengthRange(): [number, number] {
    const startingLength = {
      easy: 3,
      medium: 5,
      hard: 7
    }[this.difficulty];

    // Increase word length as levels progress.
    const min = Math.min(
      11,
      startingLength + Math.floor((this.level - 1) / 2)
    );

    const max = Math.min(12, min + 2);

    return [min, max];
  }

  nextWord(): void {
    this.hintLevel = 0;
    this.hintPenalty = 0;
    if (this.loading || this.gameOver) return;

    const [minLength, maxLength] = this.getLengthRange();

    // Select unused words at the current difficulty.
    let candidates = this.dictionary.filter(word =>
      word.length >= minLength &&
      word.length <= maxLength &&
      !this.usedWords.has(word)
    );

    // If no words remain in the range, allow nearby lengths.
    if (candidates.length === 0) {
      candidates = this.dictionary.filter(word =>
        !this.usedWords.has(word)
      );

      candidates.sort((a, b) => {
        const distanceA = Math.max(
          minLength - a.length,
          0,
          a.length - maxLength
        );
        const distanceB = Math.max(
          minLength - b.length,
          0,
          b.length - maxLength
        );

        return distanceA - distanceB;
      });

      if (candidates.length > 0) {
        const bestDistance = Math.max(
          minLength - candidates[0].length,
          0,
          candidates[0].length - maxLength
        );

        candidates = candidates.filter(word =>
          Math.max(
            minLength - word.length,
            0,
            word.length - maxLength
          ) === bestDistance
        );
      }
    }

    if (candidates.length === 0) {
      this.finishGame();
      return;
    }

    const randomIndex = Math.floor(
      Math.random() * candidates.length
    );

    this.currentWord = candidates[randomIndex];
    this.usedWords.add(this.currentWord);

    this.scrambledWord = this.scramble(this.currentWord);
    this.answer = '';
    this.wordSolved = false;
    this.message = '';

    this.hint = `${this.currentWord.length}-letter word`;
  }

  
  checkAnswer(): void {
    if (this.gameOver || this.wordSolved || this.loading) {
      return;
    }

    const guess = this.answer.trim().toUpperCase();

    const isTargetWord = guess === this.currentWord;
    const isAlternativeWord =
      !isTargetWord && this.isValidAnagram(guess);

    if (isTargetWord || isAlternativeWord) {
      const earnedPoints = this.possiblePoints;
      this.score += earnedPoints;
      this.solvedCount++;
      this.wordSolved = true;

      const previousLevel = this.level;

      this.level = Math.min(
        this.maxLevel,
        Math.floor(this.solvedCount / this.answersPerLevel) + 1
      );

      this.message = isAlternativeWord
        ? `🎉 "${guess}" is also a valid word! The original word was "${this.currentWord}". +${earnedPoints} points.`
        : `🎉 Correct! +${earnedPoints} points.`;

      if (this.level > previousLevel) {
        this.message += ` Level ${this.level} unlocked!`;
      }

      if (this.solvedCount >= this.totalWords) {
        this.finishGame();
      }

    } else {
      this.message = '❌ Not quite! Try again or use a hint.';
    }
  }


  skipWord(): void {
    if (this.gameOver || this.loading) return;

    // Skipping does not increase the level.
    this.nextWord();
  }

  private scramble(word: string): string {
    const letters = word.split('');

    for (let attempt = 0; attempt < 30; attempt++) {
      const shuffled = [...letters];

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[j]] =
          [shuffled[j], shuffled[i]];
      }

      const result = shuffled.join('');

      if (result !== word) {
        return result;
      }
    }

    return word.split('').reverse().join('');
  }

  private finishGame(): void {
    this.stopTimer();
    this.gameOver = true;
    this.wordSolved = true;

    this.message =
      `Game complete! Score: ${this.score}. Time: ${this.formattedTime}`;
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }
}
