import { storeReferrer, storeVisitorId } from './growth';

describe('store install referrer', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('carries only the visitor ID and reads it back', () => {
    expect(storeReferrer(id.toUpperCase())).toBe(`vid=${id}`);
    expect(storeVisitorId(`vid=${id}`)).toBe(id);
    expect(storeVisitorId(id)).toBe(id);
  });

  it('rejects anything that is not a visitor ID', () => {
    expect(storeReferrer('x')).toBeNull();
    for (const value of [
      null,
      '',
      'vid=',
      'utm_source=linkedin',
      `vid=${id}&x=1`,
    ])
      expect(storeVisitorId(value)).toBeNull();
  });
});
