"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFlag,
  faPlus,
  faToggleOn,
  faToggleOff,
  faTrash,
  faSpinner,
  faFlask,
  faChevronDown,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { useToast } from "@/app/components/ToastProvider";

interface Rule {
  id: string;
  type: "ALLOWLIST" | "PERCENT_ROLLOUT" | "AND" | "OR";
  condition: Record<string, unknown>;
  order: number;
}

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  environment: "DEV" | "STAGING" | "PROD";
  rules: Rule[];
  createdAt: string;
}

const envColors = {
  DEV: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  STAGING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  PROD: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export default function FeatureFlagsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  const toast = useToast();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const [testUserId, setTestUserId] = useState("");
  const [testEnv, setTestEnv] = useState<"DEV" | "STAGING" | "PROD">("DEV");
  const [testResult, setTestResult] = useState<{
    flagId: string;
    enabled: boolean;
    reason: string;
    trace: string[];
  } | null>(null);

  const [newFlag, setNewFlag] = useState({
    key: "",
    name: "",
    description: "",
    environment: "DEV" as "DEV" | "STAGING" | "PROD",
    enabled: false,
  });

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/feature-flags");
      if (!response.ok) throw new Error("Failed to fetch flags");
      const data = await response.json();
      setFlags(data.flags);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch flags");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFlag = async () => {
    if (!newFlag.key || !newFlag.name) return;

    setCreating(true);
    try {
      const response = await fetch("/api/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFlag),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create flag");
      }

      await fetchFlags();
      setShowCreate(false);
      setNewFlag({
        key: "",
        name: "",
        description: "",
        environment: "DEV",
        enabled: false,
      });
      toast.success("Feature flag created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create flag");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleFlag = async (flag: FeatureFlag) => {
    try {
      const response = await fetch(`/api/feature-flags/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });

      if (!response.ok) throw new Error("Failed to toggle flag");

      setFlags(
        flags.map((f) =>
          f.id === flag.id ? { ...f, enabled: !f.enabled } : f
        )
      );
      toast.success(`Flag ${flag.enabled ? 'disabled' : 'enabled'} successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle flag");
    }
  };

  const handleDeleteFlag = async (flagId: string) => {
    if (!confirm("Are you sure you want to delete this flag?")) return;

    try {
      const response = await fetch(`/api/feature-flags/${flagId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete flag");

      setFlags(flags.filter((f) => f.id !== flagId));
      toast.success("Flag deleted successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete flag");
    }
  };

  const handleTestFlag = async (flagId: string) => {
    if (!testUserId) {
      toast.error("Please enter a user ID to test");
      return;
    }

    try {
      const response = await fetch(`/api/feature-flags/${flagId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: testUserId,
          environment: testEnv,
        }),
      });

      if (!response.ok) throw new Error("Failed to evaluate flag");

      const result = await response.json();
      setTestResult({ flagId, ...result });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to test flag");
    }
  };

  const formatRuleCondition = (rule: Rule): string => {
    const cond = rule.condition;
    switch (rule.type) {
      case "ALLOWLIST":
        return `Users: ${(cond.userIds as string[])?.join(", ") || "none"}`;
      case "PERCENT_ROLLOUT":
        return `${cond.percentage}% rollout`;
      case "AND":
        return `AND (${(cond.rules as unknown[])?.length || 0} sub-rules)`;
      case "OR":
        return `OR (${(cond.rules as unknown[])?.length || 0} sub-rules)`;
      default:
        return JSON.stringify(cond);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faPlus} />
          New Flag
        </button>
      </div>

      {/* Create Flag Form */}
      {showCreate && (
        <div className="mb-6 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Create New Flag</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Key</label>
              <input
                type="text"
                value={newFlag.key}
                onChange={(e) =>
                  setNewFlag({ ...newFlag, key: e.target.value.toLowerCase().replace(/\s/g, "_") })
                }
                placeholder="feature_name"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={newFlag.name}
                onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                placeholder="Feature Name"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Environment</label>
              <select
                value={newFlag.environment}
                onChange={(e) =>
                  setNewFlag({ ...newFlag, environment: e.target.value as "DEV" | "STAGING" | "PROD" })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="DEV">DEV</option>
                <option value="STAGING">STAGING</option>
                <option value="PROD">PROD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={newFlag.description}
                onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                placeholder="Optional description"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFlag}
              disabled={creating || !newFlag.key || !newFlag.name}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded flex items-center gap-2"
            >
              {creating && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Test Flag Panel */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faFlask} />
          Test Flag Evaluation
        </h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">User ID</label>
            <input
              type="text"
              value={testUserId}
              onChange={(e) => setTestUserId(e.target.value)}
              placeholder="user-123"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Environment</label>
            <select
              value={testEnv}
              onChange={(e) => setTestEnv(e.target.value as "DEV" | "STAGING" | "PROD")}
              className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
            >
              <option value="DEV">DEV</option>
              <option value="STAGING">STAGING</option>
              <option value="PROD">PROD</option>
            </select>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`px-2 py-1 rounded text-sm font-medium ${
                  testResult.enabled
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                }`}
              >
                {testResult.enabled ? "ENABLED" : "DISABLED"}
              </span>
              <span className="text-gray-500 dark:text-gray-400">{testResult.reason}</span>
            </div>
            <details className="text-sm">
              <summary className="text-gray-500 cursor-pointer">Evaluation trace</summary>
              <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300 text-xs overflow-x-auto">
                {testResult.trace.join("\n")}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* Flags List */}
      {flags.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-500">
          <FontAwesomeIcon icon={faFlag} className="text-4xl mb-4" />
          <p>No feature flags yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="p-4 flex items-center gap-4">
                <button
                  onClick={() => setExpandedFlag(expandedFlag === flag.id ? null : flag.id)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <FontAwesomeIcon
                    icon={expandedFlag === flag.id ? faChevronDown : faChevronRight}
                  />
                </button>

                <button
                  onClick={() => handleToggleFlag(flag)}
                  className={`text-2xl ${flag.enabled ? "text-green-500" : "text-gray-400 dark:text-gray-500"}`}
                >
                  <FontAwesomeIcon icon={flag.enabled ? faToggleOn : faToggleOff} />
                </button>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-900 dark:text-white">{flag.key}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${envColors[flag.environment]}`}>
                      {flag.environment}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{flag.name}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{(flag.rules || []).length} rules</span>
                  <button
                    onClick={() => handleTestFlag(flag.id)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                    title="Test this flag"
                  >
                    <FontAwesomeIcon icon={faFlask} />
                  </button>
                  <button
                    onClick={() => handleDeleteFlag(flag.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>

              {expandedFlag === flag.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
                  {flag.description && (
                    <p className="text-gray-500 dark:text-gray-400 mb-4">{flag.description}</p>
                  )}

                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rules</h3>
                  {!flag.rules || flag.rules.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      No rules defined. Flag applies to all users when enabled.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {flag.rules.map((rule, idx) => (
                        <div
                          key={rule.id}
                          className="flex items-center gap-3 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                        >
                          <span className="text-gray-500 text-sm">{idx + 1}.</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              rule.type === "ALLOWLIST"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                                : rule.type === "PERCENT_ROLLOUT"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                            }`}
                          >
                            {rule.type}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300 text-sm">
                            {formatRuleCondition(rule)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Link
                    href={`/t/${tenantSlug}/feature-flags/${flag.id}`}
                    className="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm"
                  >
                    Edit flag & rules →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
