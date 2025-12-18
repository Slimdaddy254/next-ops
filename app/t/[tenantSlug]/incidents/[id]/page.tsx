"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: { id: string; name: string };
}

interface TimelineEvent {
  id: string;
  type: "NOTE" | "ACTION" | "STATUS_CHANGE";
  message?: string;
  data?: Record<string, unknown>;
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
  attachments?: Attachment[];
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["MITIGATED", "RESOLVED"],
  MITIGATED: ["RESOLVED", "OPEN"],
  RESOLVED: ["OPEN"],
};

export default function IncidentDetailPage({
  params,
}: {
  params: { tenantSlug: string; id: string };
}) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
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

    fetchIncident();
  }, [params.id]);

  const getFileIcon = (fileType: string) => {
    if (fileType.includes("pdf")) return "📄";
    if (fileType.includes("word") || fileType.includes("document"))
      return "📝";
    if (fileType.includes("sheet") || fileType.includes("excel"))
      return "📊";
    if (fileType.includes("image")) return "🖼️";
    return "📎";
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
        throw new Error("Failed to update status");
      }

      const updated = await response.json();
      setIncident(updated);
      setTransitionMessage("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !incident) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `/api/incidents/${params.id}/attachments`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
      }

      // Refresh incident to get updated attachments
      const refreshResponse = await fetch(`/api/incidents/${params.id}`);
      if (refreshResponse.ok) {
        const updated = await refreshResponse.json();
        setIncident(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload files");
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!incident) return;

    try {
      const response = await fetch(
        `/api/incidents/${params.id}/attachments/${attachmentId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete attachment");
      }

      setIncident({
        ...incident,
        attachments: (incident.attachments || []).filter(
          (a) => a.id !== attachmentId
        ),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete attachment"
      );
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-center py-8 text-red-500">Error: {error}</div>;
  if (!incident) return <div className="text-center py-8">Not found</div>;

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
        {VALID_TRANSITIONS[incident.status]?.length > 0 && (
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
              {VALID_TRANSITIONS[incident.status]?.map((status) => (
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

        {/* Attachments */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Attachments</h2>

          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50"
            }`}
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFileUpload(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <label className="cursor-pointer">
              <p className="text-gray-600 font-semibold mb-2">
                Drag files here or click to upload
              </p>
              <p className="text-sm text-gray-500">
                Max 10MB per file (PDF, Word, Excel, Images)
              </p>
              <input
                type="file"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          {/* Attachments List */}
          {(incident.attachments || []).length === 0 ? (
            <p className="text-gray-500">No attachments yet</p>
          ) : (
            <div className="space-y-2">
              {(incident.attachments || []).map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">
                      {getFileIcon(attachment.fileType)}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {attachment.fileName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {(attachment.fileSize / 1024).toFixed(2)} KB •{" "}
                        {attachment.uploadedBy.name} •{" "}
                        {new Date(attachment.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAttachment(attachment.id)}
                    className="ml-4 text-red-600 hover:text-red-700 text-sm font-semibold"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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
