import {
  LayoutDashboard,
  Sunrise,
  Users,
  UsersRound,
  Clock,
  FileText,
  LifeBuoy,
  ListChecks,
  PenLine,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  BookLock,
  Star,
  ChartLine,
  Landmark,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly: boolean;
  /** Placeholder page -- says so before the click rather than after it. */
  soon?: boolean;
};

/**
 * The navigation, in one place.
 *
 * Shared by the desktop sidebar and the mobile drawer so the two cannot
 * drift: a tab added to one and forgotten in the other is invisible to
 * whoever happens to be on the wrong screen size.
 *
 * Ordered by how the day runs, not by data model: what needs attention
 * first, then the work being recorded, then the money, then reference and
 * configuration. Settings stays last because it is the one nobody visits
 * twice in a session.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/today", label: "Today", icon: Sunrise, adminOnly: false },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy, adminOnly: false },
  { href: "/time-entries", label: "Time Entries", icon: Clock, adminOnly: false },
  { href: "/tasks", label: "Tasks", icon: ListChecks, adminOnly: false },
  { href: "/team", label: "Team", icon: UsersRound, adminOnly: false },
  { href: "/invoices", label: "Invoices", icon: FileText, adminOnly: false },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, adminOnly: true },
  { href: "/accounting", label: "Accounting", icon: Landmark, adminOnly: true },
  { href: "/analytics", label: "Analytics", icon: ChartLine, adminOnly: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, adminOnly: true },
  { href: "/documentation", label: "Docs", icon: BookLock, adminOnly: true, soon: true },
  { href: "/clients", label: "Clients", icon: Users, adminOnly: false },
  { href: "/reviews", label: "Reviews", icon: Star, adminOnly: true, soon: true },
  { href: "/signature", label: "Signature", icon: PenLine, adminOnly: false },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard, adminOnly: true, soon: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function navItemsFor(role: "admin" | "technician"): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
}
