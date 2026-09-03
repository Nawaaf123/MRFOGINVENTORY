function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

export function keysToCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keysToCamel)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      keysToCamel(nested),
    ])
  )
}

export function keysToSnake(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(keysToSnake)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      keysToSnake(nested),
    ])
  )
}
