// semver of the engine; a save with a different major is refused (00-arch §6)
export const ENGINE_VERSION = '0.1.0'

export function majorVersion(v: string): number { return Number(v.split('.')[0]) }
