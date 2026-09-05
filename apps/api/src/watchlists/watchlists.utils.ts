const PRICE_MINOR_UNITS = 100;

export function parseNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseNullablePrice(
  minorUnits: string | number | null | undefined,
  decimalValue: string | null | undefined
): number | null {
  if (decimalValue !== null && decimalValue !== undefined) {
    return parseNullableNumber(decimalValue);
  }

  const parsed = parseNullableNumber(minorUnits);
  return parsed === null ? null : parsed / PRICE_MINOR_UNITS;
}

export function parseNullableDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
