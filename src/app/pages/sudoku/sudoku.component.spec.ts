import { TestBed } from '@angular/core/testing';
import { SudokuComponent } from './sudoku.component';

describe('SudokuComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SudokuComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(SudokuComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'sudoku-solver' title`, () => {
    const fixture = TestBed.createComponent(SudokuComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('sudoku-solver');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(SudokuComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Hello, sudoku-solver');
  });
});
