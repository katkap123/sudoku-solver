
import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { SudokuComponent } from './pages/sudoku/sudoku.component';
import { TicTacToeComponent } from './pages/tic-tac-toe/tic-tac-toe.component';
import { MemoryGameComponent } from './pages/memory-game/memory-game.component';
import { NumberPuzzleComponent } from './pages/number-puzzle/number-puzzle.component';
import { Game2048Component } from './pages/game-2048/game-2048.component';
import { WordPuzzleComponent } from './pages/word-puzzle/word-puzzle.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    title: 'Free Online Puzzle Games | Play Sudoku Online Free'
  },
  {
    path: 'word-puzzle',
    component: WordPuzzleComponent,
    title: 'Free Word Search Puzzle Online | Play Sudoku Online Free'
  },
  {
    path: 'word-puzzle',
    loadComponent: () =>
      import('./pages/word-puzzle/word-puzzle.component')
        .then(m => m.WordPuzzleComponent)
  },
  {
    path: 'word-puzzle/solo',
    loadComponent: () =>
      import('./pages/word-puzzle-solo/word-puzzle-solo.component')
        .then(m => m.WordPuzzleSoloComponent)
  },
  {
    path: 'word-puzzle/multiplayer',
    loadComponent: () =>
      import('./pages/word-puzzle-multiplayer/word-puzzle-multiplayer.component')
        .then(m => m.WordPuzzleMultiplayerComponent)
  },
  {
    path: 'number-puzzle',
    component: NumberPuzzleComponent,
    title: 'Play Number Sliding Puzzle Free Online'
  },
  {
    path: '2048',
    component: Game2048Component,
    title: 'Play 2048 Online Free | Number Merge Puzzle'
  },
  {
    path: 'sudoku',
    component: SudokuComponent,
    title: 'Play Free Sudoku Online | Play Sudoku Online Free'
  },
  {
    path: 'memory-game',
    component: MemoryGameComponent,
    title: 'Play Free Memory Matching Game | Play Sudoku Online Free'
  },
  {
    path: 'tic-tac-toe',
    component: TicTacToeComponent,
    title: 'Play Tic Tac Toe Free Online | Play Sudoku Online Free'
  },
  {
    path: '**',
    redirectTo: ''
  },
];
