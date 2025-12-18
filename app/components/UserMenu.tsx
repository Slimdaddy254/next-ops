"use client";

import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faSignOutAlt,
  faBuilding,
  faChevronDown,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { logout, switchTenant } from "@/app/actions/auth";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface UserMenuProps {
  user: {
    name: string;
    email: string;
  };
  tenants: Tenant[];
  currentTenantSlug: string;
}

export default function UserMenu({ user, tenants, currentTenantSlug }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentTenant = tenants.find((t) => t.slug === currentTenantSlug);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors"
      >
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <FontAwesomeIcon icon={faUser} className="text-white text-sm" />
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-gray-400">{currentTenant?.name}</p>
        </div>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`text-gray-400 text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-gray-700">
            <p className="font-medium text-white">{user.name}</p>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>

          {tenants.length > 1 && (
            <div className="p-2 border-b border-gray-700">
              <p className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">
                Switch Organization
              </p>
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => {
                    setIsOpen(false);
                    switchTenant(tenant.slug);
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-700 transition-colors"
                >
                  <FontAwesomeIcon icon={faBuilding} className="text-gray-400" />
                  <div className="flex-1 text-left">
                    <p className="text-sm text-white">{tenant.name}</p>
                    <p className="text-xs text-gray-500">{tenant.role}</p>
                  </div>
                  {tenant.slug === currentTenantSlug && (
                    <FontAwesomeIcon icon={faCheck} className="text-green-500" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="p-2">
            <form action={logout}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-700 transition-colors text-red-400"
              >
                <FontAwesomeIcon icon={faSignOutAlt} />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
