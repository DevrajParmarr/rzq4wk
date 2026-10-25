import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "./client";

// The backend serves an immutable snapshot, so cached results never go stale within a session.
const STATIC = { staleTime: Infinity, gcTime: 30 * 60 * 1000 } as const;

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: api.meta, ...STATIC });

export const useDayAhead = (deliveryDate: string | undefined, gate: string) =>
  useQuery({
    queryKey: ["day-ahead", deliveryDate, gate],
    queryFn: () => api.dayAhead(deliveryDate!, gate),
    enabled: Boolean(deliveryDate),
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useAccuracy = (gate: string) =>
  useQuery({ queryKey: ["accuracy", gate], queryFn: () => api.accuracy(gate), placeholderData: keepPreviousData, ...STATIC });

export const useSeries = (start: string, end: string, horizonH: number) =>
  useQuery({
    queryKey: ["series", start, end, horizonH],
    queryFn: () => api.series(start, end, horizonH),
    enabled: Boolean(start && end && start < end),
    placeholderData: keepPreviousData,
    ...STATIC,
  });
