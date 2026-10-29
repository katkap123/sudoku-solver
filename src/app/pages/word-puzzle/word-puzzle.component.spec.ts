import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WordPuzzleComponent } from './word-puzzle.component';

describe('WordPuzzleComponent', () => {
  let component: WordPuzzleComponent;
  let fixture: ComponentFixture<WordPuzzleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordPuzzleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WordPuzzleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
