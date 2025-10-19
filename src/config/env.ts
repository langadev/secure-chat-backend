import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? "30d",
  TOKEN_VERSION: process.env.JWT_TOKEN_VERSION ?? "1",
};
