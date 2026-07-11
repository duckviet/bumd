import type { VersionStatus } from "@/entities/dashboard/model/dashboard-store";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/shared/ui/status-badge";

type VersionStatusBadgeProps = {
  readonly label?: string;
  readonly status?: VersionStatus;
};

function getVersionStatusLabel(status: VersionStatus | undefined) {
  if (!status) {
    return "No deploys";
  }

  switch (status) {
    case "failed":
      return "failed";
    case "processing":
      return "processing";
    case "queued":
      return "queued";
    case "ready":
      return "ready";
    default: {
      const exhaustiveStatus: never = status;
      return exhaustiveStatus;
    }
  }
}

function getVersionStatusTone(
  status: VersionStatus | undefined,
): StatusBadgeTone {
  if (!status) {
    return "neutral";
  }

  switch (status) {
    case "failed":
      return "danger";
    case "queued":
    case "processing":
      return "warning";
    case "ready":
      return "success";
    default: {
      const exhaustiveStatus: never = status;
      return exhaustiveStatus;
    }
  }
}

export function VersionStatusBadge({
  label,
  status,
}: VersionStatusBadgeProps) {
  return (
    <StatusBadge
      label={status === undefined ? "No deploys" : `${label ? `${label} ` : ""}${getVersionStatusLabel(status)}`}
      tone={getVersionStatusTone(status)}
    />
  );
}
