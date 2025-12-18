"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FormData {
  title: string;
  severity: "SEV1" | "SEV2" | "SEV3" | "SEV4";
  service: string;
  environment: "DEV" | "STAGING" | "PROD";
  tags: string;
}

export default function NewIncidentPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    title: "",
    severity: "SEV2",
    service: "",
    environment: "PROD",
    tags: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        severity: formData.severity,
        service: formData.service,
        environment: formData.environment,
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };

      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create incident");
      }

      const incident = await response.json();
      router.push(`/t/${tenantSlug}/incidents/${incident.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href={`/t/${tenantSlug}/incidents`}
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block transition-colors"
          >
            ← Back to Incidents
          </Link>
          <h1 className="text-3xl font-bold text-white">Create Incident</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-8"
        >
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Brief description of the incident"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Severity *
              </label>
              <select
                value={formData.severity}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    severity: e.target.value as "SEV1" | "SEV2" | "SEV3" | "SEV4",
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="SEV1">SEV1 - Critical</option>
                <option value="SEV2">SEV2 - High</option>
                <option value="SEV3">SEV3 - Medium</option>
                <option value="SEV4">SEV4 - Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Environment *
              </label>
              <select
                value={formData.environment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    environment: e.target.value as "DEV" | "STAGING" | "PROD",
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="PROD">Production</option>
                <option value="STAGING">Staging</option>
                <option value="DEV">Development</option>
              </select>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Service *
            </label>
            <input
              type="text"
              required
              value={formData.service}
              onChange={(e) =>
                setFormData({ ...formData, service: e.target.value })
              }
              placeholder="e.g., API, Database, Cache"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tags
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="Comma-separated tags (e.g., database, timeout, critical)"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-400">
              Separate multiple tags with commas
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 transition-colors"
            >
              {loading ? "Creating..." : "Create Incident"}
            </button>
            <Link
              href={`/t/${tenantSlug}/incidents`}
              className="px-6 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
