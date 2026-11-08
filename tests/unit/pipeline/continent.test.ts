import { describe, expect, it } from 'vitest';
import { continentOfCountryCode, resolveContinent } from '../../../scripts/events/continent.ts';

describe('continent', () => {
  it('maps country codes to continents', () => {
    expect(continentOfCountryCode('us')).toBe('north-america');
    expect(continentOfCountryCode('BR')).toBe('south-america');
    expect(continentOfCountryCode('DE')).toBe('europe');
    expect(continentOfCountryCode('KR')).toBe('asia');
    expect(continentOfCountryCode('EG')).toBe('africa');
    expect(continentOfCountryCode('AU')).toBe('oceania');
    expect(continentOfCountryCode('ZZ')).toBeUndefined();
    expect(continentOfCountryCode(undefined)).toBeUndefined();
  });

  it('reads a country, a city or a US state out of a location', () => {
    const at = (location: string) => resolveContinent({ location });
    expect(at('Seoul, South Korea')).toBe('asia');
    expect(at('Paris, France')).toBe('europe');
    expect(at('Austin, TX')).toBe('north-america');
    expect(at('Nairobi, Kenya')).toBe('africa');
    expect(at('Sydney, Australia')).toBe('oceania');
    expect(at('São Paulo, Brazil')).toBe('south-america');
  });

  it('prefers the country code, then falls back to the source region', () => {
    expect(resolveContinent({ countryCode: 'JP', location: 'Somewhere' })).toBe('asia');
    expect(resolveContinent({ sourceRegion: 'north-america' })).toBe('north-america');
    expect(resolveContinent({ sourceRegion: 'global' })).toBeUndefined();
  });
});
