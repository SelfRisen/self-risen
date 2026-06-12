import cityTimezones from 'city-timezones';
import * as ct from 'countries-and-timezones';
import { UserLocationDto } from '../dto/user-locale.dto';

export interface UserLocationUpdateData {
    timezone?: string;
    countryCode?: string;
    city?: string;
    locationUpdatedAt?: Date;
}

interface CityTimezoneMatch {
    iso2?: string;
    timezone?: string;
    pop?: number;
}

function normalizeCityName(city: string): string {
    return city
        .trim()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/\s+/g, ' ');
}

function lookupCityTimezone(
    iso2: string,
    cityName: string,
): string | null {
    let matches: CityTimezoneMatch[] =
        cityTimezones.lookupViaCity(cityName) ?? [];
    matches = matches.filter((m) => m.iso2?.toUpperCase() === iso2);

    if (matches.length >= 1) {
        if (matches.length > 1) {
            matches.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
        }
        return matches[0].timezone ?? null;
    }

    const normalized = normalizeCityName(cityName);
    if (normalized !== cityName) {
        return lookupCityTimezone(iso2, normalized);
    }

    return null;
}

/**
 * When a city is missing from the dataset, use the most populous known
 * city's timezone for that country (e.g. Mexico City for MX).
 */
function getPrimaryTimezoneForCountry(iso2: string): string | null {
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
 * Resolve IANA timezone from ISO country code + city.
 */
export function resolveTimezoneFromLocation(
    countryCode: string,
    city: string,
): string | null {
    const iso2 = countryCode.trim().toUpperCase();
    const cityName = city.trim();
    if (!iso2 || !cityName) {
        return null;
    }

    const exactMatch = lookupCityTimezone(iso2, cityName);
    if (exactMatch) {
        return exactMatch;
    }

    return getPrimaryTimezoneForCountry(iso2);
}

/**
 * Build Prisma user fields from country + city.
 * Timezone is derived from countryCode + city when both are present.
 */
export function buildUserLocaleUpdate(
    dto?: UserLocationDto | null,
): UserLocationUpdateData | null {
    if (!dto) {
        return null;
    }

    const data: UserLocationUpdateData = {};
    let touched = false;

    if (dto.countryCode?.trim()) {
        data.countryCode = dto.countryCode.trim().toUpperCase();
        touched = true;
    }

    if (dto.city?.trim()) {
        data.city = dto.city.trim();
        touched = true;
    }

    if (data.countryCode && data.city) {
        const resolved = resolveTimezoneFromLocation(data.countryCode, data.city);
        if (resolved) {
            data.timezone = resolved;
            touched = true;
        }
    }

    if (!touched) {
        return null;
    }

    if (data.countryCode || data.city || data.timezone) {
        data.locationUpdatedAt = new Date();
    }

    return data;
}
