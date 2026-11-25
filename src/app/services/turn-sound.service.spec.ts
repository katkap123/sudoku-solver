import { TestBed } from '@angular/core/testing';

import { TurnSoundService } from './turn-sound.service';

describe('TurnSoundService', () => {
  let service: TurnSoundService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TurnSoundService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
