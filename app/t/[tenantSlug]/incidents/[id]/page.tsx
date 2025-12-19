"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFile,
  faFileWord,
  faFileExcel,
  faImage,
  faPaperclip,
  faTrash,
  faSpinner,
  faStickyNote,
  faBolt,
  faExchangeAlt,
} from "@fortawesome/free-solid-svg-icons";
import { useToast } from "@/app/components/ToastProvider";

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
  SEV1: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
  SEV2: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30",
  SEV3: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30",
  SEV4: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
};

const statusColors = {
  OPEN: "bg-red-50 text-red-700 border-l-red-500 dark:bg-red-500/20 dark:text-red-300",
  MITIGATED: "bg-yellow-50 text-yellow-700 border-l-yellow-500 dark:bg-yellow-500/20 dark:text-yellow-300",
  RESOLVED: "bg-green-50 text-green-700 border-l-green-500 dark:bg-green-500/20 dark:text-green-300",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["MITIGATED", "RESOLVED"],
  MITIGATED: ["RESOLVED"],
  RESOLVED: [], // Cannot transition from resolved
};

export default function IncidentDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = use(params);
  const toast = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Initial fetch
  useEffect(() => {
    const fetchIncident = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/incidents/${id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch incident");
        }
        const data = await response.json();
        setIncident(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch incident");
      } finally {
        setLoading(false);
      }
    };

    fetchIncident();
  }, [id, toast]);

  // SSE for realtime updates
  useEffect(() => {
    if (!incident) return;

    const eventSource = new EventSource(`/api/incidents/${id}/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "incident_updated" && incident) {
          // Only update if SSE data is newer than current state
          // This prevents SSE from overwriting optimistic updates
          const currentTime = new Date(incident.updatedAt).getTime();
          const sseTime = new Date(data.data.updatedAt).getTime();
          
          if (sseTime > currentTime) {
            setIncident({
              ...incident,
              ...data.data,
            });
          }
        }

        if (data.type === "timeline_updated" && incident) {
          // Merge new events at the beginning
          const newEvents = data.data.newEvents;
          setIncident({
            ...incident,
            timeline: [...newEvents, ...incident.timeline],
          });
        }

        if (data.type === "deleted") {
          setError("This incident has been deleted");
        }
      } catch {
        // Ignore parse errors for heartbeats
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const getFileIcon = (fileType: string) => {
    if (fileType.includes("pdf")) return faFile;
    if (fileType.includes("word") || fileType.includes("document"))
      return faFileWord;
    if (fileType.includes("sheet") || fileType.includes("excel"))
      return faFileExcel;
    if (fileType.includes("image")) return faImage;
    return faPaperclip;
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!incident) return;

    const previousStatus = incident.status;
    const previousIncident = incident;
    
    try {
      // Optimistic update - batch state changes
      const optimisticUpdate = {
        ...incident,
        status: newStatus as "OPEN" | "MITIGATED" | "RESOLVED",
        updatedAt: new Date().toISOString(),
      };
      setIncident(optimisticUpdate);
      setUpdating(true);
      
      const response = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          message: transitionMessage,
        }),
      });

      if (!response.ok) {
        // Rollback on error - batch state changes
        setIncident(previousIncident);
        setUpdating(false);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update status");
      }

      // Get the server response - batch final updates
      const updated = await response.json();
      setIncident(updated);
      setTransitionMessage("");
      setUpdating(false);
      toast.success("Status updated successfully");
    } catch (err) {
      setUpdating(false);
      toast.error(err instanceof Error ? err.message : "Failed to update status");
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
          `/api/incidents/${id}/attachments`,
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
      const refreshResponse = await fetch(`/api/incidents/${id}`);
      if (refreshResponse.ok) {
        const updated = await refreshResponse.json();
        setIncident(updated);
      }
      toast.success("Files uploaded successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload files");
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!incident) return;

    try {
      const response = await fetch(
        `/api/incidents/${id}/attachments/${attachmentId}`,
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
      toast.success("Attachment deleted successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete attachment"
      );
    }
  };

  const handleAddNote = async () => {
    if (!noteInput.trim() || !incident) return;

    setAddingNote(true);
    try {
      const response = await fetch(`/api/incidents/${id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "NOTE", message: noteInput }),
      });

      if (!response.ok) {
        throw new Error("Failed to add note");
      }

      // Refresh incident to get updated timeline
      const refreshResponse = await fetch(`/api/incidents/${id}`);
      if (refreshResponse.ok) {
        const updated = await refreshResponse.json();
        setIncident(updated);
      }
      setNoteInput("");
      toast.success("Note added successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  const handleAddAction = async () => {
    if (!actionInput.trim() || !incident) return;

    setAddingAction(true);
    try {
      const response = await fetch(`/api/incidents/${id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ACTION", message: actionInput }),
      });

      if (!response.ok) {
        throw new Error("Failed to add action");
      }

      // Refresh incident to get updated timeline
      const refreshResponse = await fetch(`/api/incidents/${id}`);
      if (refreshResponse.ok) {
        const updated = await refreshResponse.json();
        setIncident(updated);
      }
      setActionInput("");
      toast.success("Action added successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add action");
    } finally {
      setAddingAction(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!incident) return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Not found</div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <Link
            href={`/t/${tenantSlug}/incidents`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            ← Back to Incidents
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-gray-400 dark:bg-gray-500"
              }`}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {isConnected ? "Live" : "Connecting..."}
            </span>
          </div>
        </div>

        <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8 mb-8 border-l-4 ${statusColors[incident.status]}`}>
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{incident.title}</h1>
            <div className="flex gap-2">
              <span
                className={`px-4 py-2 rounded-full font-medium border ${
                  severityColors[incident.severity]
                }`}
              >
                {incident.severity}
              </span>
              <span
                className={`px-4 py-2 rounded-full font-medium border ${
                  incident.status === 'OPEN' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30' :
                  incident.status === 'MITIGATED' ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30' :
                  'bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30'
                }`}
              >
                {incident.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Service</p>
              <p className="text-gray-900 dark:text-white">{incident.service}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Environment</p>
              <p className="text-gray-900 dark:text-white">{incident.environment}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Created by</p>
              <p className="text-gray-900 dark:text-white">{incident.createdBy.name}</p>
            </div>
            {incident.assignee && (
              <div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Assigned to</p>
                <p className="text-gray-900 dark:text-white">{incident.assignee.name}</p>
              </div>
            )}
          </div>

          {incident.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {incident.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded border border-gray-200 dark:border-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status Transitions */}
        {VALID_TRANSITIONS[incident.status]?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Update Status
            </h2>
            <textarea
              value={transitionMessage}
              onChange={(e) => setTransitionMessage(e.target.value)}
              placeholder="Add a note about this status change (optional)"
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
            <div className="flex gap-3">
              {VALID_TRANSITIONS[incident.status]?.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusTransition(status)}
                  disabled={updating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:text-gray-200 dark:disabled:text-gray-400 transition-colors"
                >
                  {updating ? "Updating..." : `Mark as ${status}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Attachments</h2>

          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
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
              <p className="text-gray-700 dark:text-gray-300 font-semibold mb-2">
                Drag files here or click to upload
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
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
            <p className="text-gray-500 dark:text-gray-400">No attachments yet</p>
          ) : (
            <div className="space-y-2">
              {(incident.attachments || []).map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FontAwesomeIcon
                      icon={getFileIcon(attachment.fileType)}
                      className="text-xl text-blue-500 dark:text-blue-400"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {attachment.fileName}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(attachment.fileSize / 1024).toFixed(2)} KB •{" "}
                        {attachment.uploadedBy.name} •{" "}
                        {new Date(attachment.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAttachment(attachment.id)}
                    className="ml-4 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                    title="Delete attachment"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-lg" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Timeline</h2>
          
          {/* Add Note/Action Forms */}
          <div className="mb-8 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !noteInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:text-gray-200 dark:disabled:text-gray-400 flex items-center gap-2 transition-colors"
              >
                {addingNote ? (
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                ) : (
                  <FontAwesomeIcon icon={faStickyNote} />
                )}
                Note
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder="Log an action taken..."
                className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleAddAction()}
              />
              <button
                onClick={handleAddAction}
                disabled={addingAction || !actionInput.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:text-gray-200 dark:disabled:text-gray-400 flex items-center gap-2 transition-colors"
              >
                {addingAction ? (
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                ) : (
                  <FontAwesomeIcon icon={faBolt} />
                )}
                Action
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {!incident.timeline || incident.timeline.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No timeline events yet</p>
            ) : (
              incident.timeline.map((event) => (
                <div key={event.id} className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        event.type === "STATUS_CHANGE"
                          ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30"
                          : event.type === "ACTION"
                          ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30"
                          : "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30"
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={
                          event.type === "STATUS_CHANGE"
                            ? faExchangeAlt
                            : event.type === "ACTION"
                            ? faBolt
                            : faStickyNote
                        }
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-500">
                        {event.type.replace("_", " ")}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {event.createdBy.name} • {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-900 dark:text-white">
                      {event.type === "STATUS_CHANGE"
                        ? `Status changed from ${event.data?.from || "New"} to ${event.data?.to}`
                        : event.message || "No message"}
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
