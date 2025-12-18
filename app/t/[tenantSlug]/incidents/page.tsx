"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

interface Incident {
  id: string;
  title: string;
  severity: "SEV1" | "SEV2" | "SEV3" | "SEV4";
  status: "OPEN" | "MITIGATED" | "RESOLVED";
  service: string;
  environment: "DEV" | "STAGING" | "PROD";
  tags: string[];
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
  assignee?: { id: string; name: string; email: string } | null;
}

const severityColors = {
  SEV1: "bg-red-100 text-red-800",
  SEV2: "bg-orange-100 text-orange-800",
  SEV3: "bg-yellow-100 text-yellow-800",
  SEV4: "bg-blue-100 text-blue-800",
};

const statusColors = {
  OPEN: "bg-red-50 text-red-700",
  MITIGATED: "bg-yellow-50 text-yellow-700",
  RESOLVED: "bg-green-50 text-green-700",
};

export default function IncidentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  const searchParams = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIncidents, setSelectedIncidents] = useState<Set<string>>(
    new Set()
  );
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionMessage, setBulkActionMessage] = useState("");
  const [bulkActionType, setBulkActionType] = useState<
    "assign-engineer" | "change-status" | ""
  >("");
  const [bulkActionValue, setBulkActionValue] = useState("");
  const [filters, setFilters] = useState({
    status: searchParams.get("status") || "",
    severity: searchParams.get("severity") || "",
    environment: searchParams.get("environment") || "",
    search: searchParams.get("search") || "",
  });

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        setLoading(true);
        const queryParams = new URLSearchParams();
        
        if (filters.status) queryParams.append("status", filters.status);
        if (filters.severity) queryParams.append("severity", filters.severity);
        if (filters.environment)
          queryParams.append("environment", filters.environment);
        if (filters.search) queryParams.append("search", filters.search);

        const response = await fetch(`/api/incidents?${queryParams}`);
        if (!response.ok) {
          throw new Error("Failed to fetch incidents");
        }

        const data = await response.json();
        setIncidents(data.incidents);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setIncidents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, [filters]);

  const toggleIncidentSelection = (id: string) => {
    const newSelected = new Set(selectedIncidents);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIncidents(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIncidents.size === incidents.length) {
      setSelectedIncidents(new Set());
    } else {
      setSelectedIncidents(new Set(incidents.map((i) => i.id)));
    }
  };

  const handleBulkAction = async () => {
    if (selectedIncidents.size === 0 || !bulkActionType || !bulkActionValue) {
      return;
    }

    setBulkActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        incidentIds: Array.from(selectedIncidents),
        action: bulkActionType,
      };

      if (bulkActionType === "assign-engineer") {
        payload.assigneeId = bulkActionValue;
      } else if (bulkActionType === "change-status") {
        payload.status = bulkActionValue;
        if (bulkActionMessage) {
          payload.message = bulkActionMessage;
        }
      }

      const response = await fetch("/api/incidents/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to perform bulk action");
      }

      // Refresh incidents
      const refreshResponse = await fetch(`/api/incidents?${new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v)
      )}`);
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setIncidents(data.incidents);
      }

      setSelectedIncidents(new Set());
      setBulkActionType("");
      setBulkActionValue("");
      setBulkActionMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to perform bulk action"
      );
    } finally {
      setBulkActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Incidents</h1>
          <Link
            href={`/t/${tenantSlug}/incidents/new`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            New Incident
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search incidents..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />

            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="MITIGATED">Mitigated</option>
              <option value="RESOLVED">Resolved</option>
            </select>

            <select
              value={filters.severity}
              onChange={(e) =>
                setFilters({ ...filters, severity: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Severities</option>
              <option value="SEV1">SEV1</option>
              <option value="SEV2">SEV2</option>
              <option value="SEV3">SEV3</option>
              <option value="SEV4">SEV4</option>
            </select>

            <select
              value={filters.environment}
              onChange={(e) =>
                setFilters({ ...filters, environment: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Environments</option>
              <option value="PROD">Production</option>
              <option value="STAGING">Staging</option>
              <option value="DEV">Development</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedIncidents.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-blue-900">
                {selectedIncidents.size} incident(s) selected
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={bulkActionType}
                  onChange={(e) =>
                    setBulkActionType(
                      e.target.value as "assign-engineer" | "change-status" | ""
                    )
                  }
                  className="px-3 py-2 border border-blue-300 rounded-lg text-sm"
                >
                  <option value="">Select action...</option>
                  <option value="assign-engineer">Assign Engineer</option>
                  <option value="change-status">Change Status</option>
                </select>

                {bulkActionType === "assign-engineer" && (
                  <select
                    value={bulkActionValue}
                    onChange={(e) => setBulkActionValue(e.target.value)}
                    className="px-3 py-2 border border-blue-300 rounded-lg text-sm"
                  >
                    <option value="">Select engineer...</option>
                    <option value="user1">Engineer 1</option>
                    <option value="user2">Engineer 2</option>
                    <option value="user3">Engineer 3</option>
                  </select>
                )}

                {bulkActionType === "change-status" && (
                  <>
                    <select
                      value={bulkActionValue}
                      onChange={(e) => setBulkActionValue(e.target.value)}
                      className="px-3 py-2 border border-blue-300 rounded-lg text-sm"
                    >
                      <option value="">Select status...</option>
                      <option value="OPEN">Open</option>
                      <option value="MITIGATED">Mitigated</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Add note (optional)"
                      value={bulkActionMessage}
                      onChange={(e) => setBulkActionMessage(e.target.value)}
                      className="px-3 py-2 border border-blue-300 rounded-lg text-sm"
                    />
                  </>
                )}

                <button
                  onClick={handleBulkAction}
                  disabled={
                    bulkActionLoading ||
                    !bulkActionType ||
                    !bulkActionValue
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm font-medium flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faCheck} />
                  {bulkActionLoading ? "Processing..." : "Apply"}
                </button>

                <button
                  onClick={() => {
                    setSelectedIncidents(new Set());
                    setBulkActionType("");
                    setBulkActionValue("");
                    setBulkActionMessage("");
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incidents List */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">Error: {error}</div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No incidents found
          </div>
        ) : (
          <div className="space-y-4">
            {/* Select All Checkbox */}
            {incidents.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIncidents.size === incidents.length && incidents.length > 0}
                  onChange={toggleSelectAll}
                  className="w-5 h-5 rounded border-gray-300 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All
                </span>
              </div>
            )}

            {incidents.map((incident) => (
              <div
                key={incident.id}
                className={`flex items-start gap-4 bg-white rounded-lg shadow hover:shadow-lg transition p-6 border-l-4 ${
                  selectedIncidents.has(incident.id)
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIncidents.has(incident.id)}
                  onChange={() => toggleIncidentSelection(incident.id)}
                  className="w-5 h-5 rounded border-gray-300 cursor-pointer mt-1"
                />
                <Link
                  href={`/t/${tenantSlug}/incidents/${incident.id}`}
                  className="flex-1"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                      {incident.title}
                    </h3>
                    <div className="flex gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          severityColors[incident.severity]
                        }`}
                      >
                        {incident.severity}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          statusColors[incident.status]
                        }`}
                      >
                        {incident.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <div className="space-y-1">
                      <p>
                        <span className="font-medium">Service:</span>{" "}
                        {incident.service}
                      </p>
                      <p>
                        <span className="font-medium">Environment:</span>{" "}
                        {incident.environment}
                      </p>
                    </div>
                    <div className="text-right">
                      <p>
                        <span className="font-medium">Created by:</span>{" "}
                        {incident.createdBy.name}
                      </p>
                      {incident.assignee && (
                        <p>
                          <span className="font-medium">Assigned to:</span>{" "}
                          {incident.assignee.name}
                        </p>
                      )}
                    </div>
                  </div>

                  {incident.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {incident.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
