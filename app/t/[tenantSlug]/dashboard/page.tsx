"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faCheckCircle,
  faShieldAlt,
  faClock,
  faChartLine,
  faFlag,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

interface Stats {
  incidents: {
    total: number;
    open: number;
    mitigated: number;
    resolved: number;
    bySeverity: { SEV1: number; SEV2: number; SEV3: number; SEV4: number };
  };
  featureFlags: {
    total: number;
    enabled: number;
    disabled: number;
  };
  recentActivity: {
    id: string;
    type: string;
    message: string;
    createdAt: string;
  }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch incidents
        const incidentsRes = await fetch("/api/incidents?limit=100");
        const incidentsData = await incidentsRes.json();
        const incidents = incidentsData.incidents || [];

        // Fetch feature flags
        const flagsRes = await fetch("/api/feature-flags");
        const flags = await flagsRes.json();

        // Fetch recent audit logs
        const auditRes = await fetch("/api/audit-logs?limit=5");
        const auditData = await auditRes.json();

        // Calculate stats
        const incidentStats = {
          total: incidents.length,
          open: incidents.filter((i: { status: string }) => i.status === "OPEN").length,
          mitigated: incidents.filter((i: { status: string }) => i.status === "MITIGATED").length,
          resolved: incidents.filter((i: { status: string }) => i.status === "RESOLVED").length,
          bySeverity: {
            SEV1: incidents.filter((i: { severity: string }) => i.severity === "SEV1").length,
            SEV2: incidents.filter((i: { severity: string }) => i.severity === "SEV2").length,
            SEV3: incidents.filter((i: { severity: string }) => i.severity === "SEV3").length,
            SEV4: incidents.filter((i: { severity: string }) => i.severity === "SEV4").length,
          },
        };

        const flagStats = {
          total: flags.length,
          enabled: flags.filter((f: { enabled: boolean }) => f.enabled).length,
          disabled: flags.filter((f: { enabled: boolean }) => !f.enabled).length,
        };

        setStats({
          incidents: incidentStats,
          featureFlags: flagStats,
          recentActivity: auditData.logs || [],
        });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Incident Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Incidents</p>
              <p className="text-3xl font-bold text-white">
                {stats?.incidents.total || 0}
              </p>
            </div>
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="text-gray-500 text-2xl"
            />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-red-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Open</p>
              <p className="text-3xl font-bold text-red-400">
                {stats?.incidents.open || 0}
              </p>
            </div>
            <FontAwesomeIcon icon={faClock} className="text-red-500 text-2xl" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-yellow-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Mitigated</p>
              <p className="text-3xl font-bold text-yellow-400">
                {stats?.incidents.mitigated || 0}
              </p>
            </div>
            <FontAwesomeIcon
              icon={faShieldAlt}
              className="text-yellow-500 text-2xl"
            />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-green-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Resolved</p>
              <p className="text-3xl font-bold text-green-400">
                {stats?.incidents.resolved || 0}
              </p>
            </div>
            <FontAwesomeIcon
              icon={faCheckCircle}
              className="text-green-500 text-2xl"
            />
          </div>
        </div>
      </div>

      {/* Severity Breakdown & Feature Flags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Breakdown */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faChartLine} className="text-blue-400" />
            Incidents by Severity
          </h2>
          <div className="space-y-3">
            {["SEV1", "SEV2", "SEV3", "SEV4"].map((sev) => {
              const count =
                stats?.incidents.bySeverity[
                  sev as keyof typeof stats.incidents.bySeverity
                ] || 0;
              const total = stats?.incidents.total || 1;
              const percentage = Math.round((count / total) * 100);
              const colors: Record<string, string> = {
                SEV1: "bg-red-500",
                SEV2: "bg-orange-500",
                SEV3: "bg-yellow-500",
                SEV4: "bg-blue-500",
              };

              return (
                <div key={sev}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{sev}</span>
                    <span className="text-gray-400">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[sev]} transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feature Flags */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faFlag} className="text-purple-400" />
            Feature Flags
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                {stats?.featureFlags.total || 0}
              </p>
              <p className="text-gray-400 text-sm">Total</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">
                {stats?.featureFlags.enabled || 0}
              </p>
              <p className="text-gray-400 text-sm">Enabled</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-500">
                {stats?.featureFlags.disabled || 0}
              </p>
              <p className="text-gray-400 text-sm">Disabled</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FontAwesomeIcon icon={faUsers} className="text-cyan-400" />
          Recent Activity
        </h2>
        {stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {stats.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
              >
                <div>
                  <p className="text-gray-300">
                    <span className="font-medium text-white">
                      {activity.type}
                    </span>{" "}
                    on {activity.message}
                  </p>
                </div>
                <span className="text-gray-500 text-sm">
                  {new Date(activity.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No recent activity</p>
        )}
      </div>
    </div>
  );
}
