export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

export function getJwtSecret(): string {
  return getRequiredEnv('JWT_SECRET')
}
