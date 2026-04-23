globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
} as any
globalThis.document = {
  documentElement: {
    lang: 'en',
  },
} as any
