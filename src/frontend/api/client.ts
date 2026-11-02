// The one place the dashboard calls the server. Every call returns the parsed JSON, or throws an ApiError
// carrying the server's own message, so callers can show it.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Every write sends JSON, with {} when there is no body, because the server answers 415 to any other content type.
  const write = method === "POST" || method === "PUT" || method === "PATCH";
  const res = await fetch(path, {
    method,
    headers: write ? JSON_HEADERS : undefined,
    body: write ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error ?? `request failed with status ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// The text to show for any caught error.
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
