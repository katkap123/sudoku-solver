
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-word-puzzle',
  standalone: true,
  templateUrl: './word-puzzle.component.html',
  styleUrls: ['./word-puzzle.component.css']
})
export class WordPuzzleComponent {

  constructor(private router: Router) {}

  playSingle(): void {
    this.router.navigate(['/word-puzzle/solo']);
  }

  playMultiplayer(): void {
    this.router.navigate(['/word-puzzle/multiplayer']);
  }
}
