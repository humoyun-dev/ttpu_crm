import { useState, useEffect, useCallback } from "react";

export function useSearch(delay = 300) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), delay);
    return () => clearTimeout(timer);
  }, [searchTerm, delay]);

  const reset = useCallback(() => {
    setSearchTerm("");
    setDebouncedSearch("");
  }, []);

  return { searchTerm, debouncedSearch, setSearch: setSearchTerm, reset };
}
