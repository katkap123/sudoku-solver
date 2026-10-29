
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface WordMatch {
  word: string;
  cells: number[];
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isWord: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class WordSearchSolverService {
  private root: TrieNode = this.createNode();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  private readonly directions: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];

  constructor(private http: HttpClient) {}

  private createNode(): TrieNode {
    return {
      children: new Map<string, TrieNode>(),
      isWord: false
    };
  }

  async loadDictionary(): Promise<void> {
    if (this.loaded) return;

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.fetchDictionary();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async fetchDictionary(): Promise<void> {
    const content = await firstValueFrom(
      this.http.get(
        '/assets/dictionaries/words.txt',
        { responseType: 'text' }
      )
    );

    const root = this.createNode();
    let count = 0;

    for (const line of content.split(/\r?\n/)) {
      const word = line.trim().toUpperCase();

      if (
        !/^[A-Z]+$/.test(word) ||
        word.length < 3 ||
        word.length > 12
      ) {
        continue;
      }

      let node = root;

      for (const letter of word) {
        let child = node.children.get(letter);

        if (!child) {
          child = this.createNode();
          node.children.set(letter, child);
        }

        node = child;
      }

      if (!node.isWord) {
        node.isWord = true;
        count++;
      }
    }

    if (count === 0) {
      throw new Error('Dictionary contains no valid words.');
    }

    this.root = root;
    this.loaded = true;

    console.log('Dictionary loaded:', count, 'words');
  }

  isValidWord(word: string): boolean {
    if (!this.loaded) return false;

    const normalized = word.trim().toUpperCase();

    let node = this.root;

    for (const letter of normalized) {
      const next = node.children.get(letter);

      if (!next) return false;
      node = next;
    }

    return node.isWord;
  }

  findAllWords(
    grid: string[][],
    minLength = 3
  ): WordMatch[] {
    if (!this.loaded || grid.length === 0) {
      return [];
    }

    const rows = grid.length;
    const cols = grid[0].length;

    // Store ALL occurrences, not just one per word.
    const matches: WordMatch[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        for (const [dr, dc] of this.directions) {
          let r = row;
          let c = col;

          let node = this.root;
          let word = '';

          const cells: number[] = [];

          while (
            r >= 0 &&
            r < rows &&
            c >= 0 &&
            c < cols
          ) {
            const letter = grid[r][c].toUpperCase();
            const next = node.children.get(letter);

            if (!next) break;

            node = next;
            word += letter;
            cells.push(r * cols + c);

            if (
              node.isWord &&
              word.length >= minLength
            ) {
              matches.push({
                word,
                cells: [...cells]
              });
            }

            r += dr;
            c += dc;
          }
        }
      }
    }

    return matches.sort(
      (a, b) => b.word.length - a.word.length
    );
  }
}
