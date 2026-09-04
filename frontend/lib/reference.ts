/** A collision-resistant, human-readable reference for operational records. */
export function createReference(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}
