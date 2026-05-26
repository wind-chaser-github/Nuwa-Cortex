import { useCallback, useEffect, useState } from "react";

import { fetchCortexDashboard } from "@/lib/api";
import type { CortexDashboard } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export function useCortexDashboard(query: string = "") {
  const { token } = useClient();
  const [data, setData] = useState<CortexDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchCortexDashboard(token, query);
      setData(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
