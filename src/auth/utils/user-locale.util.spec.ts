import {
    buildUserLocaleUpdate,
    resolveTimezoneFromLocation,
} from './user-locale.util';

describe('user-locale.util', () => {
    describe('resolveTimezoneFromLocation', () => {
        it('resolves US city timezone', () => {
            expect(resolveTimezoneFromLocation('US', 'Chicago')).toBe(
                'America/Chicago',
            );
        });

        it('picks the largest city when multiple share a name', () => {
            expect(resolveTimezoneFromLocation('US', 'Portland')).toBe(
                'America/Los_Angeles',
            );
        });

        it('falls back to the primary timezone for unknown cities in multi-timezone countries', () => {
            expect(
                resolveTimezoneFromLocation('US', 'NonexistentCityXYZ123'),
            ).toBe('America/New_York');
        });

        it('resolves Valle de Bravo, Mexico via country primary timezone fallback', () => {
            expect(resolveTimezoneFromLocation('MX', 'Valle de Bravo')).toBe(
                'America/Mexico_City',
            );
        });
    });

    describe('buildUserLocaleUpdate', () => {
        it('derives timezone from country and city', () => {
            const result = buildUserLocaleUpdate({
                countryCode: 'US',
                city: 'New York',
            });
            expect(result?.timezone).toBe('America/New_York');
            expect(result?.countryCode).toBe('US');
            expect(result?.city).toBe('New York');
            expect(result?.locationUpdatedAt).toBeInstanceOf(Date);
        });

        it('returns null when no location fields provided', () => {
            expect(buildUserLocaleUpdate({})).toBeNull();
        });
    });
});
