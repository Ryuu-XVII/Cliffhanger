/* eslint-env jest */

// react-native-mmkv is a Nitro module with no JS fallback in the test runtime;
// the kv layer already degrades to memory, so the mock just makes that explicit.
jest.mock('react-native-mmkv', () => {
  throw new Error('MMKV unavailable in tests');
});

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
