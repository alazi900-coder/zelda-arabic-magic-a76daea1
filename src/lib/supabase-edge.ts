/** Helper to get Supabase edge function URL and auth headers */
export function getEdgeFunctionUrl(functionName: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/${functionName}`;
}

export function getSupabaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ...extra,
  };
}
