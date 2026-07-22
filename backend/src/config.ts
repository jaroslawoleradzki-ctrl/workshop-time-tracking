import 'dotenv/config';

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const JWT_SECRET = requireEnvironmentVariable('JWT_SECRET');
