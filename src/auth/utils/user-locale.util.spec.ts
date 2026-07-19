import {
  buildUserLocaleUpdate,
  resolveTimezoneFromCountry,
} from './user-locale.util';

describe('user-locale.util', () => {
  describe('resolveTimezoneFromCountry', () => {
    it('resolves single-timezone country', () => {
      expect(resolveTimezoneFromCountry('GB')).toBe('Europe/London');
    });

    it('uses the most populous city timezone for multi-timezone countries', () => {
      expect(resolveTimezoneFromCountry('US')).toBe('America/New_York');
      expect(resolveTimezoneFromCountry('MX')).toBe('America/Mexico_City');
    });

    it('returns null for invalid country code', () => {
      expect(resolveTimezoneFromCountry('')).toBeNull();
      expect(resolveTimezoneFromCountry('ZZ')).toBeNull();
    });
  });

  describe('buildUserLocaleUpdate', () => {
    it('derives timezone from country code', () => {
      const result = buildUserLocaleUpdate({ countryCode: 'MX' });
      expect(result?.timezone).toBe('America/Mexico_City');
      expect(result?.countryCode).toBe('MX');
      expect(result?.locationUpdatedAt).toBeInstanceOf(Date);
    });

    it('returns null when country code is missing', () => {
      expect(buildUserLocaleUpdate({})).toBeNull();
      expect(buildUserLocaleUpdate({ countryCode: '  ' })).toBeNull();
    });
  });
});
