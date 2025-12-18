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

interface SavedView {
  id: string;
  name: string;
  filters: {
    status?: string;
    severity?: string;
    environment?: string;
    search?: string;
  };
}

const severityColors = {
  SEV1: "bg-red-500/20 text-red-400 border border-red-500/30",
  SEV2: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  SEV3: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  SEV4: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
};

const statusColors = {
  OPEN: "bg-red-500/20 text-red-300 border border-red-500/30",
  MITIGATED: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  RESOLVED: "bg-green-500/20 text-green-300 border border-green-500/30",
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

  // Saved Views state
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

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

  // Fetch saved views
  useEffect(() => {
    const fetchSavedViews = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantSlug}/saved-views`);
        if (response.ok) {
          const data = await response.json();
          setSavedViews(data);
        }
      } catch (err) {
        console.error("Failed to fetch saved views:", err);
      }
    };
    fetchSavedViews();
  }, [tenantSlug]);

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;
    
    setSavingView(true);
    try {
      const response = await fetch(`/api/tenants/${tenantSlug}/saved-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newViewName, filters }),
      });
      
      if (response.ok) {
        const newView = await response.json();
        setSavedViews([newView, ...savedViews]);
        setNewViewName("");
        setShowSaveViewModal(false);
      }
    } catch (err) {
      console.error("Failed to save view:", err);
    } finally {
      setSavingView(false);
    }
  };

  const handleApplyView = (view: SavedView) => {
    setFilters({
      status: view.filters.status || "",
      severity: view.filters.severity || "",
      environment: view.filters.environment || "",
      search: view.filters.search || "",
    });
  };

  const handleDeleteView = async (viewId: string) => {
    try {
      const response = await fetch(`/api/tenants/${tenantSlug}/saved-views/${viewId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        setSavedViews(savedViews.filter((v) => v.id !== viewId));
      }
    } catch (err) {
      console.error("Failed to delete view:", err);
    }
  };

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
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Incidents</h1>
          <Link
            href={`/t/${tenantSlug}/incidents/new`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Incident
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search incidents..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Environments</option>
              <option value="PROD">Production</option>
              <option value="STAGING">Staging</option>
              <option value="DEV">Development</option>
            </select>
          </div>

          {/* Saved Views */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-400">Saved Views</span>
              <button
                onClick={() => setShowSaveViewModal(true)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                + Save Current View
              </button>
            </div>
            
            {savedViews.length === 0 ? (
              <p className="text-sm text-gray-500">No saved views yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {savedViews.map((view) => (
                  <div
                    key={view.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg"
                  >
                    <button
                      onClick={() => handleApplyView(view)}
                      className="text-sm text-white hover:text-blue-300"
                    >
                      {view.name}
                    </button>
                    <button
                      onClick={() => handleDeleteView(view.id)}
                      className="text-gray-500 hover:text-red-400 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Save View Modal */}
        {showSaveViewModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold text-white mb-4">Save Current View</h3>
              <input
                type="text"
                placeholder="View name..."
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg mb-4"
              />
              <div className="text-sm text-gray-400 mb-4">
                <p className="font-medium mb-1">Current Filters:</p>
                <ul className="text-xs space-y-1">
                  {filters.status && <li>Status: {filters.status}</li>}
                  {filters.severity && <li>Severity: {filters.severity}</li>}
                  {filters.environment && <li>Environment: {filters.environment}</li>}
                  {filters.search && <li>Search: &quot;{filters.search}&quot;</li>}
                  {!filters.status && !filters.severity && !filters.environment && !filters.search && (
                    <li>No filters applied</li>
                  )}
                </ul>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowSaveViewModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveView}
                  disabled={!newViewName.trim() || savingView}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg"
                >
                  {savingView ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Actions Toolbar */}
        {selectedIncidents.size > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-blue-300">
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
                  className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select action...</option>
                  <option value="assign-engineer">Assign Engineer</option>
                  <option value="change-status">Change Status</option>
                </select>

                {bulkActionType === "assign-engineer" && (
                  <select
                    value={bulkActionValue}
                    onChange={(e) => setBulkActionValue(e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                      className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                      className="px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-sm font-medium flex items-center gap-2 transition-colors"
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
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incidents List */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-400">Error: {error}</div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No incidents found
          </div>
        ) : (
          <div className="space-y-4">
            {/* Select All Checkbox */}
            {incidents.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIncidents.size === incidents.length && incidents.length > 0}
                  onChange={toggleSelectAll}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 cursor-pointer focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">
                  Select All
                </span>
              </div>
            )}

            {incidents.map((incident) => (
              <div
                key={incident.id}
                className={`flex items-start gap-4 bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-all p-6 border-l-4 border ${
                  selectedIncidents.has(incident.id)
                    ? "border-blue-500 bg-blue-500/10 border-blue-500/50"
                    : "border-gray-700 border-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIncidents.has(incident.id)}
                  onChange={() => toggleIncidentSelection(incident.id)}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 cursor-pointer mt-1 focus:ring-2 focus:ring-blue-500"
                />
                <Link
                  href={`/t/${tenantSlug}/incidents/${incident.id}`}
                  className="flex-1"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-white hover:text-blue-400 transition-colors">
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

                  <div className="flex justify-between items-center text-sm text-gray-400">
                    <div className="space-y-1">
                      <p>
                        <span className="font-medium text-gray-300">Service:</span>{" "}
                        <span className="text-gray-400">{incident.service}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-300">Environment:</span>{" "}
                        <span className="text-gray-400">{incident.environment}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p>
                        <span className="font-medium text-gray-300">Created by:</span>{" "}
                        <span className="text-gray-400">{incident.createdBy.name}</span>
                      </p>
                      {incident.assignee && (
                        <p>
                          <span className="font-medium text-gray-300">Assigned to:</span>{" "}
                          <span className="text-gray-400">{incident.assignee.name}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {incident.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {incident.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600"
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
