import { setOnline } from '@/api/http';
import { scheduleAutoSync } from '@/data/autoSync';

describe('scheduleAutoSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires once, after the debounce window', () => {
    const sync = jest.fn();
    scheduleAutoSync(sync);

    jest.advanceTimersByTime(1499);
    expect(sync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of calls into a single sync', () => {
    const sync = jest.fn();
    scheduleAutoSync(sync);
    jest.advanceTimersByTime(800);
    scheduleAutoSync(sync);
    jest.advanceTimersByTime(800);
    scheduleAutoSync(sync);

    jest.advanceTimersByTime(1500);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('never schedules while offline, so the connectivity-regained listener is the only trigger', () => {
    setOnline(false);
    const sync = jest.fn();
    scheduleAutoSync(sync);

    jest.advanceTimersByTime(10_000);
    expect(sync).not.toHaveBeenCalled();
  });
});
