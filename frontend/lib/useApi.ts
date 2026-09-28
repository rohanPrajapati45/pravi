"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PageMeta } from "@/types/api";

type Query = Record<string, string | number | boolean | null | undefined>;

// Authenticated GET with loading/error state; re-fetches when path or query change.
export function useApi<T>(path: string | null, query?: Query) {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const queryKey = JSON.stringify(query ?? {});
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path || !token) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { token, query: JSON.parse(queryKey) });
      if (id !== requestId.current) return;
      setData(result.data);
      setMeta(result.meta);
      setStatus(200);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof ApiError ? caught.message : "Something went wrong");
      setStatus(caught instanceof ApiError ? caught.status : null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, token, queryKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, meta, loading, error, status, reload: load };
}
