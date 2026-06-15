import cityTimezones from 'city-timezones';
import * as ct from 'countries-and-timezones';
import { UserLocationDto } from '../dto/user-locale.dto';

export interface UserLocationUpdateData {
    timezone?: string;
    countryCode?: string;
    locationUpdatedAt?: Date;
}

interface CityTimezoneMatch {
    iso2?: string;
    timezone?: string;
    pop?: number;
}

/**
 * Resolve IANA timezone from ISO 3166-1 alpha-2 country code.
 * Single-timezone countries use that zone; multi-timezone countries use the
 * most populous known city's timezone (e.g. Mexico City for MX).
 */
export function resolveTimezoneFromCountry(countryCode: string): string | null {
    const iso2 = countryCode.trim().toUpperCase();
    if (!iso2) {
        return null;
    }

    const country = ct.getCountry(iso2);
    const zones = country?.timezones ?? [];
    if (zones.length === 0) {
        return null;
    }
    if (zones.length === 1) {
        return zones[0];
    }

    const countryCities = (cityTimezones.findFromIsoCode(iso2) ??
        []) as CityTimezoneMatch[];
    if (countryCities.length > 0) {
        countryCities.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
        const primaryTimezone = countryCities[0].timezone;
        if (primaryTimezone && (zones as string[]).includes(primaryTimezone)) {
            return primaryTimezone;
        }
    }

    return zones[0] ?? null;
}

/**
 * Build Prisma user fields from countryCode; timezone is derived server-side.
 */
export function buildUserLocaleUpdate(
    dto?: UserLocationDto | null,
): UserLocationUpdateData | null {
    if (!dto?.countryCode?.trim()) {
        return null;
    }

    const countryCode = dto.countryCode.trim().toUpperCase();
    const timezone = resolveTimezoneFromCountry(countryCode);

    return {
        countryCode,
        ...(timezone && { timezone }),
        locationUpdatedAt: new Date(),
    };
}
