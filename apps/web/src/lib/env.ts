function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabaseKey = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const pinSessionSecret = () => {
  const secret = required("PIN_SESSION_SECRET", process.env.PIN_SESSION_SECRET);
  if (secret.length < 32) throw new Error("PIN_SESSION_SECRET must be at least 32 characters");
  return secret;
};
