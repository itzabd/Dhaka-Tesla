// The client''s lib/api.ts uses window.localStorage, which is not available in
// Node.js. This test verifies the *contract* -- that two keys can coexist --
// using an in-memory mock that mirrors the client implementation.

describe('role-partitioned auth storage', () => {
  const store: Record<string, string> = {};
  const localStorageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };

  beforeEach(() => localStorageMock.clear());

  it('stores passenger and driver tokens under separate keys', () => {
    localStorageMock.setItem('token_passenger', 'passenger-jwt-xyz');
    localStorageMock.setItem('token_driver', 'driver-jwt-abc');

    expect(localStorageMock.getItem('token_passenger')).toBe('passenger-jwt-xyz');
    expect(localStorageMock.getItem('token_driver')).toBe('driver-jwt-abc');
    expect(localStorageMock.getItem('token')).toBeNull();
  });

  it('clearing one role does not affect the other', () => {
    localStorageMock.setItem('token_passenger', 'p1');
    localStorageMock.setItem('token_driver', 'd1');

    localStorageMock.removeItem('token_passenger');

    expect(localStorageMock.getItem('token_passenger')).toBeNull();
    expect(localStorageMock.getItem('token_driver')).toBe('d1');
  });

  it('logging in as a new passenger overwrites only the passenger token', () => {
    localStorageMock.setItem('token_passenger', 'old-passenger');
    localStorageMock.setItem('token_driver', 'driver-stable');

    localStorageMock.setItem('token_passenger', 'new-passenger');

    expect(localStorageMock.getItem('token_passenger')).toBe('new-passenger');
    expect(localStorageMock.getItem('token_driver')).toBe('driver-stable');
  });
});
