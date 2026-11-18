"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; section?: string };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  let lastSection: string | undefined;
  return (
    <>
      <button className="btn-secondary btn-sm md:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>メニュー</button>
      <nav className={`${open ? "block" : "hidden"} absolute left-0 right-0 top-14 z-20 border-b border-slate-200 bg-white p-3 md:static md:block md:border-0 md:p-0`}>
        <ul className="space-y-0.5">
          {items.map((it) => {
            const active = path === it.href || path.startsWith(it.href + "/");
            const header = it.section && it.section !== lastSection ? it.section : null;
            lastSection = it.section ?? lastSection;
            return (
              <li key={it.href}>
                {header && <p className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{header}</p>}
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
