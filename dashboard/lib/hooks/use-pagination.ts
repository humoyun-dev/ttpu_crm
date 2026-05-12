import { useState, useCallback } from "react";

export function usePagination(initialPage = 1, pageSize = 25) {
  const [page, setPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / pageSize);

  const goNext = useCallback(() => setPage((p) => Math.min(p + 1, totalPages || 1)), [totalPages]);
  const goPrev = useCallback(() => setPage((p) => Math.max(p - 1, 1)), []);
  const resetPage = useCallback(() => setPage(1), []);

  return { page, setPage, totalCount, setTotalCount, totalPages, goNext, goPrev, resetPage };
}
