/* eslint-env jest */

// Use a synchronous MMKV test double; production fallback persistence has its own tests.
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const values = new Map();
    return { getString: (key) => values.get(key), set: (key, value) => values.set(key, value),
      remove: (key) => values.delete(key), getAllKeys: () => Array.from(values.keys()), clearAll: () => values.clear() };
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

global.fetch = global.fetch || jest.fn();
