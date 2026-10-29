import { TestBed } from '@angular/core/testing';

import { WordSearchSolverService } from './word-search-solver.service';

describe('WordSearchSolverService', () => {
  let service: WordSearchSolverService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WordSearchSolverService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
