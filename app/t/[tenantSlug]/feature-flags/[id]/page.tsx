"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/app/components/ToastProvider";

interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
  rules: Rule[];
}

interface Rule {
  id: string;
  type: "ALLOWLIST" | "PERCENT_ROLLOUT" | "AND" | "OR";
  condition: Record<string, unknown>;
  order: number;
}

interface EvaluationResult {
  enabled: boolean;
  reason: string;
  trace: string[];
}

export default function FeatureFlagDetailPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const flagId = params.id as string;
  const toast = useToast();

  const [flag, setFlag] = useState<FeatureFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [rolloutPercentage, setRolloutPercentage] = useState(0);
  const [rules, setRules] = useState<Rule[]>([]);

  // New rule form state
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleType, setNewRuleType] = useState<"ALLOWLIST" | "PERCENT_ROLLOUT">("ALLOWLIST");
  const [newRuleUsers, setNewRuleUsers] = useState("");
  const [newRulePercent, setNewRulePercent] = useState(50);

  // Evaluation tool state
  const [showEvaluationTool, setShowEvaluationTool] = useState(false);
  const [evalUserId, setEvalUserId] = useState("");
  const [evalEnvironment, setEvalEnvironment] = useState<"DEV" | "STAGING" | "PROD">("PROD");
  const [evalService, setEvalService] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);

  useEffect(() => {
    fetchFlag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagId]);

  const fetchFlag = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/feature-flags/${flagId}`);
      if (!response.ok) throw new Error("Failed to fetch feature flag");
      const data = await response.json();
      setFlag(data);
      setName(data.name);
      setKey(data.key);
      setDescription(data.description || "");
      setEnabled(data.enabled);
      setRolloutPercentage(data.rolloutPercentage ?? 0);
      setRules(data.rules || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load flag");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/feature-flags/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          key,
          description,
          enabled,
          rolloutPercentage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update feature flag");
      }
      const updated = await response.json();
      setFlag(updated);
      toast.success("Feature flag updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = async () => {
    let condition: Record<string, unknown>;
    
    if (newRuleType === "ALLOWLIST") {
      const userIds = newRuleUsers.split(",").map(u => u.trim()).filter(Boolean);
      if (userIds.length === 0) {
        alert("Please enter at least one user ID");
        return;
      }
      condition = { type: "ALLOWLIST", userIds };
    } else {
      condition = { type: "PERCENT_ROLLOUT", percentage: newRulePercent };
    }

    try {
      const response = await fetch(`/api/feature-flags/${flagId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition }),
      });

      if (!response.ok) throw new Error("Failed to add rule");
      const newRule = await response.json();
      setRules([...rules, newRule]);
      setNewRuleUsers("");
      setNewRulePercent(50);
      setShowAddRule(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add rule");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    try {
      const response = await fetch(`/api/feature-flags/${flagId}/rules/${ruleId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete rule");
      setRules(rules.filter((r) => r.id !== ruleId));
      toast.success("Rule deleted successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  const formatRuleDisplay = (rule: Rule) => {
    const cond = rule.condition as { type: string; userIds?: string[]; percentage?: number };
    
    if (rule.type === "ALLOWLIST") {
      const userIds = cond.userIds || [];
      return `Allow users: ${userIds.join(", ")}`;
    } else if (rule.type === "PERCENT_ROLLOUT") {
      return `${cond.percentage || 0}% rollout`;
    }
    return JSON.stringify(rule.condition);
  };

  const handleEvaluate = async () => {
    if (!evalUserId.trim()) {
      toast.error("Please enter a User ID");
      return;
    }

    setEvaluating(true);
    setEvalResult(null);
    
    try {
      const response = await fetch(`/api/feature-flags/${flagId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: evalUserId,
          environment: evalEnvironment,
          service: evalService || undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to evaluate flag");
      const result = await response.json();
      setEvalResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to evaluate");
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading feature flag...</div>
    );
  }

  if (!flag) {
    return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Feature flag not found</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/t/${tenantSlug}/feature-flags`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Feature Flags
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Feature Flag</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-800 dark:bg-red-500/20 dark:border-red-500/30 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Main Settings */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Basic Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Feature name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="feature_key"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Describe this feature flag..."
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-5 h-5 rounded bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-700 dark:text-gray-300">Enabled</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Rollout Percentage: {rolloutPercentage}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={rolloutPercentage}
                onChange={(e) => setRolloutPercentage(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={fetchFlag}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Targeting Rules */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Targeting Rules</h2>
            <button
              onClick={() => setShowAddRule(!showAddRule)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {showAddRule ? "Cancel" : "+ Add Rule"}
            </button>
          </div>

          {showAddRule && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">New Rule</h3>
              
              <div className="mb-4">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Rule Type</label>
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value as "ALLOWLIST" | "PERCENT_ROLLOUT")}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                >
                  <option value="ALLOWLIST">Allow Specific Users</option>
                  <option value="PERCENT_ROLLOUT">Percentage Rollout</option>
                </select>
              </div>

              {newRuleType === "ALLOWLIST" ? (
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    User IDs (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newRuleUsers}
                    onChange={(e) => setNewRuleUsers(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-sm"
                    placeholder="user1, user2, user3"
                  />
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Rollout Percentage: {newRulePercent}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newRulePercent}
                    onChange={(e) => setNewRulePercent(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleAddRule}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Add Rule
              </button>
            </div>
          )}

          {!rules || rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No targeting rules. Add rules to control who sees this feature.
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30 rounded text-xs font-medium border">
                      {rule.type}
                    </span>
                    <span className="text-gray-900 dark:text-white">{formatRuleDisplay(rule)}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 border-red-200 dark:bg-red-600/20 dark:hover:bg-red-600/30 dark:text-red-400 dark:border-red-500/30 border rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Evaluation Tool */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Evaluation Tool</h2>
            <button
              onClick={() => setShowEvaluationTool(!showEvaluationTool)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {showEvaluationTool ? "Hide" : "Show"} Tool
            </button>
          </div>

          {showEvaluationTool && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Test how this feature flag evaluates for different users and contexts.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">User ID *</label>
                  <input
                    type="text"
                    value={evalUserId}
                    onChange={(e) => setEvalUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    placeholder="user-123"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Environment *</label>
                  <select
                    value={evalEnvironment}
                    onChange={(e) => setEvalEnvironment(e.target.value as "DEV" | "STAGING" | "PROD")}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  >
                    <option value="PROD">Production</option>
                    <option value="STAGING">Staging</option>
                    <option value="DEV">Development</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Service (optional)</label>
                  <input
                    type="text"
                    value={evalService}
                    onChange={(e) => setEvalService(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    placeholder="api-gateway"
                  />
                </div>
              </div>

              <button
                onClick={handleEvaluate}
                disabled={evaluating || !evalUserId.trim()}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors mb-4"
              >
                {evaluating ? "Evaluating..." : "Evaluate Flag"}
              </button>

              {evalResult && (
                <div className={`p-4 rounded-lg border ${
                  evalResult.enabled 
                    ? "bg-green-100 border-green-200 dark:bg-green-500/10 dark:border-green-500/30" 
                    : "bg-red-100 border-red-200 dark:bg-red-500/10 dark:border-red-500/30"
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-2xl font-bold ${
                      evalResult.enabled ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                    }`}>
                      {evalResult.enabled ? "✓ ENABLED" : "✗ DISABLED"}
                    </span>
                  </div>
                  <div className="mb-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Reason: </span>
                    <span className="text-gray-900 dark:text-white">{evalResult.reason}</span>
                  </div>
                  {evalResult.trace && evalResult.trace.length > 0 && (
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Evaluation Trace:</span>
                      <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 font-mono">
                        {evalResult.trace.map((step, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-gray-500">{i + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          <p>Created: {new Date(flag.createdAt).toLocaleString()}</p>
          <p>Last Updated: {new Date(flag.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
