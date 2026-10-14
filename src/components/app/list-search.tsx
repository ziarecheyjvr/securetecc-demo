"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

/**
 * URL-backed search box, shared by the list screens.
 *
 * State lives in the query string so a search is shareable and survives a
 * refresh, and the page stays a server component that re-queries rather than
 * shipping every row to the browser to filter there. Debounced, because it
 * navigates on change and a request per keystroke would queue a dozen round
 * trips for one word.
 */
export function ListSearch({
  initial,
  placeholder,
  label,
}: {
  initial: string;
  placeholder: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (value === initial) return;
    const id = setTimeout(() => {
      const q = new URLSearchParams(params.toString());
      if (value.trim()) q.set("q", value.trim());
      else q.delete("q");
      startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(id);
  }, [value, initial, params, pathname, router]);

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="h-8 w-full sm:w-72"
      aria-label={label}
    />
  );
}
