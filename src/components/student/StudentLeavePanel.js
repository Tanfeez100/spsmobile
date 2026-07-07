import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatDisplayDate } from "../../utils/date";
import { getStudentLeaves, submitStudentLeave } from "../../api/client";

const leaveTypes = ["Sick Leave", "Family Work", "Function", "Other"];
const statusLabels = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function StudentLeavePanel({ session }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [leaveType, setLeaveType] = useState("Sick Leave");
  const [leaveTypeOpen, setLeaveTypeOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const selectedLeaveTypeLabel = useMemo(() => leaveType || "Select type", [leaveType]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!session?.token) return;
      setLoading(true);
      setError("");
      try {
        const response = await getStudentLeaves(session.token);
        if (!cancelled) setRequests(Array.isArray(response?.requests) ? response.requests : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Leave requests load failed");
          setRequests([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  const submit = async () => {
    if (!fromDate || !toDate || !reason.trim()) {
      setError("From date, to date aur reason required hai.");
      return;
    }

    if (!session?.token) {
      setError("Session missing hai.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await submitStudentLeave(session.token, {
        leave_type: leaveType,
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim(),
      });

      if (response?.request) {
        setRequests((prev) => [response.request, ...prev]);
      }
      setFromDate("");
      setToDate("");
      setReason("");
      setLeaveType("Sick Leave");
    } catch (err) {
      setError(err?.message || "Leave request submit failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={styles.sectionTitleRow}>
        <Feather name="file-plus" size={18} color="#1458bf" />
        <Text style={styles.sectionTitle}>Leave Apply</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Leave Type</Text>
        <Pressable
          onPress={() => setLeaveTypeOpen((prev) => !prev)}
          style={[styles.selectButton, leaveTypeOpen && styles.selectButtonActive]}
        >
          <Text style={styles.selectText}>{selectedLeaveTypeLabel}</Text>
          <Text style={styles.chevron}>{leaveTypeOpen ? "^" : "v"}</Text>
        </Pressable>
        {leaveTypeOpen ? (
          <View style={styles.menu}>
            {leaveTypes.map((item) => {
              const active = leaveType === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    setLeaveType(item);
                    setLeaveTypeOpen(false);
                  }}
                  style={[styles.menuItem, active && styles.menuItemActive]}
                >
                  <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.grid}>
          <View style={styles.half}>
            <Text style={styles.label}>From Date</Text>
            <TextInput value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" style={styles.input} />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>To Date</Text>
            <TextInput value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" style={styles.input} />
          </View>
        </View>

        <Text style={styles.label}>Reason</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Write reason"
          style={[styles.input, styles.textArea]}
          multiline
        />

        <Pressable disabled={saving} onPress={submit} style={[styles.submitButton, saving && styles.submitButtonDisabled]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.buttonRow}>
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Submit Leave</Text>
            </View>
          )}
        </Pressable>
      </View>

      {error ? <Notice text={error} tone="error" /> : null}
      {loading ? <LoadingBlock label="Leave requests loading..." /> : null}

      {!loading && requests.length ? (
        <View style={styles.list}>
          <View style={styles.sectionTitleRow}>
            <Feather name="clock" size={18} color="#1458bf" />
            <Text style={styles.sectionTitle}>My Requests</Text>
          </View>
          {requests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHead}>
                <View style={styles.requestBody}>
                  <Text style={styles.requestTitle}>{request.leave_type || "Leave"}</Text>
                  <Text style={styles.requestMeta}>
                    {formatDisplayDate(request.from_date)} to {formatDisplayDate(request.to_date)}
                  </Text>
                  <Text style={styles.requestSub}>{request.reason}</Text>
                  {request.admin_remarks ? <Text style={styles.requestSub}>Remarks: {request.admin_remarks}</Text> : null}
                </View>
                <StatusPill status={request.status} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!loading && !requests.length ? (
        <EmptyState title="No leave requests" text="Abhi tak koi leave request submit nahi hui." />
      ) : null}
    </View>
  );
}

function Notice({ tone, text }) {
  return (
    <View style={[styles.notice, tone === "error" ? styles.noticeError : styles.noticeInfo]}>
      <View style={styles.noticeRow}>
        <Feather name={tone === "error" ? "alert-circle" : "info"} size={18} color={tone === "error" ? "#9f2f21" : "#1458bf"} />
        <Text style={styles.noticeText}>{text}</Text>
      </View>
    </View>
  );
}

function EmptyState({ title, text }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function LoadingBlock({ label }) {
  return (
    <View style={styles.loadingBlock}>
      <ActivityIndicator color="#126a6f" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || "pending").toLowerCase();
  return (
    <View style={[styles.statusPill, normalized === "approved" ? styles.statusApproved : normalized === "rejected" ? styles.statusRejected : styles.statusPending]}>
      <Text style={styles.statusText}>{statusLabels[normalized] || normalized}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: "#0b2f63",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 12,
  },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  label: {
    color: "#0d2f68",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginBottom: 7,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#fff",
    borderColor: "#dde6f2",
    borderRadius: 16,
    borderWidth: 1,
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  grid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  half: {
    flex: 1,
  },
  selectButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dde6f2",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectButtonActive: {
    borderColor: "#1458bf",
  },
  selectText: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "900",
  },
  chevron: {
    color: "#6c7d97",
    fontSize: 13,
    fontWeight: "900",
  },
  menu: {
    backgroundColor: "#fff",
    borderColor: "#dde6f2",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  menuItemActive: {
    backgroundColor: "#edf4ff",
  },
  menuItemText: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800",
  },
  menuItemTextActive: {
    color: "#1458bf",
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#1458bf",
    borderRadius: 18,
    minHeight: 56,
    justifyContent: "center",
    marginTop: 12,
    shadowColor: "#1458bf",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  submitButtonDisabled: {
    opacity: 0.72,
  },
  submitText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  buttonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  list: {
    gap: 10,
  },
  requestCard: {
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  requestHead: {
    flexDirection: "row",
    gap: 10,
  },
  requestBody: {
    flex: 1,
  },
  requestTitle: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "900",
  },
  requestMeta: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  requestSub: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  statusPill: {
    borderRadius: 999,
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPending: {
    backgroundColor: "#fef3c7",
  },
  statusApproved: {
    backgroundColor: "#dcfce7",
  },
  statusRejected: {
    backgroundColor: "#fee2e2",
  },
  statusText: {
    color: "#17202a",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "capitalize",
  },
  notice: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  noticeError: {
    backgroundColor: "#fff3f1",
    borderColor: "#f4c2ba",
  },
  noticeInfo: {
    backgroundColor: "#eef7ff",
    borderColor: "#c9defa",
  },
  noticeText: {
    color: "#17305d",
    fontSize: 13,
    fontWeight: "800",
  },
  noticeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  emptyTitle: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  loadingBlock: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 18,
  },
  loadingText: {
    color: "#1458bf",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
});
