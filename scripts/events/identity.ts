/** A conference's identity across years and across the sites that list it. */

/** The name without its year, its ordinal and "annual": what stays the same from one edition to the next. */
export function cleanConferenceName(name: string): string {
  return name
    .replace(/\b20\d\d\b/g, '')
    .replace(/\bthe\s+\d+(st|nd|rd|th)\b/gi, '')
    .replace(/\b\d+(st|nd|rd|th)\s+annual\b/gi, '')
    .replace(/\bannual\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `cleanConferenceName` with accents, case, spacing and punctuation folded away ("B|Sides" = "BSides"). */
export function conferenceKey(name: string): string {
  return cleanConferenceName(name)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function fold(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** The first part of a location ("San Francisco, CA, United States" -> "sanfrancisco"). */
export function cityKey(location: string | undefined): string {
  return fold((location ?? '').split(',')[0]);
}

/**
 * Whether two locations can be the same place. Sites write them differently ("Ottawa, ON, Canada"
 * and "BSidesOttawa, Ottawa, ONT, Canada"), so each one's city is looked for in the other's full
 * text. A missing location is compatible with anything.
 */
export function sameLocation(a: string | undefined, b: string | undefined): boolean {
  const [foldedA, foldedB] = [fold(a), fold(b)];
  if (!foldedA || !foldedB) return true;
  return foldedA.includes(cityKey(b)) || foldedB.includes(cityKey(a));
}
