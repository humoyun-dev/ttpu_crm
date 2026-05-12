import { useState, useCallback } from "react";

export function useDateFilter() {
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);

  const reset = useCallback(() => {
    setFromDate(null);
    setToDate(null);
  }, []);

  const toApiParams = useCallback((): { from?: string; to?: string } => {
    const params: { from?: string; to?: string } = {};
    if (fromDate) params.from = fromDate.toISOString();
    if (toDate) params.to = toDate.toISOString();
    return params;
  }, [fromDate, toDate]);

  return { fromDate, toDate, setFrom: setFromDate, setTo: setToDate, reset, toApiParams };
}
