"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TimelineEvent {
  id: string;
  type: "NOTE" | "ACTION" | "STATUS_CHANGE";
  message?: string;
  data?: any;
  createdAt: string;
  createdBy: { id: string; name: string };
}

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
  timeline: TimelineEvent[];
}

const severityColors = {
  SEV1: "bg-red-100 text-red-800",
  SEV2: "bg-orange-100 text-orange-800",
  SEV3: "bg-yellow-100 text-yellow-800",
  SEV4: "bg-blue-100 text-blue-800",
};

const statusColors = {
  OPEN: "bg-red-50 text-red-700 border-l-red-500",
  MITIGATED: "bg-yellow-50 text-yellow-700 border-l-yellow-500",
  RESOLVED: "bg-green-50 text-green-700 border-l-green-500",
};

export default function IncidentDetailPage({
  params,
}: {
  params: { tenantSlug: string; id: string };
}) {
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");

  useEffect(() => {
    fetchIncident();
  }, []);

  const fetchIncident = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/incidents/${params.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch incident");
      }
      const data = await response.json();
      setIncident(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!incident) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/incidents/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          message: transitionMessage,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update incident");
      }

      const updated = await response.json();
      setIncident(updated);
      setTransitionMessage("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-center py-8 text-red-500">Error: {error}</div>;
  if (!incident) return <div className="text-center py-8">Not found</div>;

  // Get valid transitions for current status
  const validTransitions: Record<string, string[]> = {
    OPEN: ["MITIGATED", "RESOLVED"],
    MITIGATED: ["RESOLVED"],
    RESOLVED: [],
  };

  const nextTransitions = validTransitions[incident.status] || [];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href={`/t/${params.tenantSlug}/incidents`}
          className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          ← Back to Incidents
        </Link>

        <div className={`bg-white rounded-lg shadow p-8 mb-8 border-l-4 ${statusColors[incident.status]}`}>
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-3xl font-bold text-gray-900">{incident.title}</h1>
            <div className="flex gap-2">
              <span
                className={`px-4 py-2 rounded-full font-medium ${
                  severityColors[incident.severity]
                }`}
              >
                {incident.severity}
              </span>
              <span
                className={`px-4 py-2 rounded-full font-medium ${
                  statusColors[incident.status]
                }`}
              >
                {incident.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="text-gray-600 font-medium">Service</p>
              <p className="text-gray-900">{incident.service}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Environment</p>
              <p className="text-gray-900">{incident.environment}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Created by</p>
              <p className="text-gray-900">{incident.createdBy.name}</p>
            </div>
            {incident.assignee && (
              <div>
                <p className="text-gray-600 font-medium">Assigned to</p>
                <p className="text-gray-900">{incident.assignee.name}</p>
              </div>
            )}
          </div>

          {incident.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {incident.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status Transitions */}
        {nextTransitions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Update Status
            </h2>
            <textarea
              value={transitionMessage}
              onChange={(e) => setTransitionMessage(e.target.value)}
              placeholder="Add a note about this status change (optional)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              {nextTransitions.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusTransition(status)}
                  disabled={updating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {updating ? "Updating..." : `Mark as ${status}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Timeline</h2>
          <div className="space-y-6">
            {incident.timeline.length === 0 ? (
              <p className="text-gray-500">No timeline events yet</p>
            ) : (
              incident.timeline.map((event) => (
                <div key={event.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        event.type === "STATUS_CHANGE"
                          ? "bg-blue-500"
                          : "bg-gray-300"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {event.type === "STATUS_CHANGE"
                        ? `Status changed: ${event.data?.from || "created"} → ${event.data?.to}`
                        : event.message || "Action"}
                    </p>
                    <p className="text-sm text-gray-600">
                      {event.createdBy.name} •{" "}
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
