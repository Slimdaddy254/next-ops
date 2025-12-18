import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faFlag,
  faChartBar,
  faCog,
} from "@fortawesome/free-solid-svg-icons";

interface SidebarProps {
  tenantSlug: string;
  currentPath: string;
}

export default function Sidebar({ tenantSlug, currentPath }: SidebarProps) {
  const navItems = [
    {
      href: `/t/${tenantSlug}/incidents`,
      label: "Incidents",
      icon: faExclamationTriangle,
    },
    {
      href: `/t/${tenantSlug}/feature-flags`,
      label: "Feature Flags",
      icon: faFlag,
    },
    {
      href: `/t/${tenantSlug}/dashboard`,
      label: "Dashboard",
      icon: faChartBar,
    },
    {
      href: `/t/${tenantSlug}/settings`,
      label: "Settings",
      icon: faCog,
    },
  ];

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 min-h-screen">
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = currentPath.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              <FontAwesomeIcon icon={item.icon} className="w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
