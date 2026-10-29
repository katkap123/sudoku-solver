import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NumberPuzzleComponent } from './number-puzzle.component';

describe('NumberPuzzleComponent', () => {
  let component: NumberPuzzleComponent;
  let fixture: ComponentFixture<NumberPuzzleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NumberPuzzleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NumberPuzzleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
