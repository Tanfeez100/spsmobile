import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { formatDisplayDate } from "../../utils/date";
import { getStudentResultAvailability, getStudentResultPublic } from "../../api/client";

const terminals = ["First", "Second", "Third", "Annual"];

export default function StudentResultsPanel({ student }) {
  const [terminal, setTerminal] = useState("First");
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [availability, setAvailability] = useState({});

  const studentClass = String(student?.class || "").trim();
  const studentSection = String(student?.section || "").trim();
  const studentRoll = String(student?.rollNo || student?.roll_no || "").trim();
  const academicYear = String(student?.academicYear || student?.academic_year || "").trim();

  const buildParams = useCallback(
    (terminalValue) => ({
      class: studentClass,
      roll: studentRoll,
      terminal: terminalValue,
      section: studentSection || undefined,
      academic_year: academicYear,
      session: academicYear,
    }),
    [academicYear, studentClass, studentRoll, studentSection]
  );

  const currentTerminalState = availability[terminal] || null;
  const currentPublished = currentTerminalState?.published === true;
  const currentKnown = Boolean(currentTerminalState);
  const currentLocked = currentKnown && !currentPublished;
  const busy = loading || availabilityLoading;

  const helperText = useMemo(() => {
    if (currentLocked) return "Result not published yet for this terminal. Terminal locked hai.";
    return error;
  }, [currentLocked, error]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailability = async () => {
      if (!studentClass || !studentRoll || !academicYear) {
        setAvailability({});
        setResult(null);
        setLoading(false);
        setError("Student profile me class, roll number ya academic year missing hai.");
        return;
      }

      setAvailabilityLoading(true);
      setError("");
      setResult(null);
      setLoading(false);

      try {
        const response = await getStudentResultAvailability({
          class: studentClass,
          roll: studentRoll,
          section: studentSection || undefined,
          academic_year: academicYear,
          session: academicYear,
        });

        if (cancelled) return;

        const nextAvailability = Object.fromEntries(
          (response?.terminals || []).map((item) => [item.terminal, item])
        );
        setAvailability(nextAvailability);

        const firstPublished = terminals.find((item) => nextAvailability[item]?.published);
        if (firstPublished) {
          setTerminal((current) => (nextAvailability[current]?.published ? current : firstPublished));
        } else {
          setTerminal("First");
        }
      } catch (err) {
        if (!cancelled) {
          setAvailability({});
          setError(err?.message || "Result availability check failed");
        }
      } finally {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      }
    };

    loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [academicYear, studentClass, studentRoll, studentSection]);

  useEffect(() => {
    let cancelled = false;

    const loadResult = async () => {
      if (!studentClass || !studentRoll || !academicYear || availabilityLoading || !currentKnown) {
        return;
      }

      if (currentLocked) {
        setLoading(false);
        setResult(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await getStudentResultPublic(buildParams(terminal));
        if (!cancelled) {
          setResult(response || null);
        }
      } catch (err) {
        if (!cancelled) {
          setResult(null);
          setError(err?.message || "Result load failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadResult();

    return () => {
      cancelled = true;
    };
  }, [academicYear, availabilityLoading, buildParams, currentKnown, currentLocked, studentClass, studentRoll, terminal]);

  const currentSummary = result?.summary || {};
  const marks = Array.isArray(result?.marks) ? result.marks : [];
  const termRows = Array.isArray(result?.terminals) ? result.terminals : [];
  const summaryCards = [
    { label: "Total", value: currentSummary.total_max_marks ?? "--", tone: "teal" },
    { label: "Obtained", value: currentSummary.total_obtained ?? "--", tone: "green" },
    { label: "Percent", value: currentSummary.percentage !== undefined && currentSummary.percentage !== null ? `${currentSummary.percentage}%` : "--", tone: "amber" },
    { label: "Division", value: currentSummary.division || "--", tone: "red" },
  ];

  return (
    <View>
      <Text style={styles.sectionTitle}>Results</Text>
      <View style={styles.card}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{student?.name || "Student"}</Text>
          <Text style={styles.rowMeta}>
            Class {studentClass || "-"} {studentSection ? `- ${studentSection}` : ""} | Roll {studentRoll || "-"}
          </Text>
          <Text style={styles.rowSub}>Academic Year {academicYear || "-"}</Text>
        </View>
      </View>

      <View style={styles.inlineField}>
        <Text style={styles.label}>Terminal</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terminalRow}>
          {terminals.map((item) => {
            const state = availability[item];
            const published = state?.published === true;
            const active = terminal === item;
            return (
              <Pressable
                key={item}
                disabled={availabilityLoading || !published}
                onPress={() => {
                  if (!published) {
                    setError("Result not published yet for this terminal.");
                    setResult(null);
                    return;
                  }
                  setTerminal(item);
                }}
                style={[
                  styles.terminalButton,
                  active && styles.terminalButtonActive,
                  !published && styles.terminalButtonLocked,
                ]}
              >
                <Text style={[styles.terminalText, active && styles.terminalTextActive, !published && styles.terminalTextLocked]}>
                  {item}
                </Text>
                <Text style={[styles.terminalSubtext, active && styles.terminalSubtextActive, !published && styles.terminalSubtextLocked]}>
                  {availabilityLoading ? "Checking..." : published ? "Published" : "Locked"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {helperText ? <Notice tone={currentLocked ? "info" : "error"} text={helperText} /> : null}
      {busy ? <LoadingBlock label={availabilityLoading ? "Checking terminal lock..." : "Result loading..."} /> : null}

      {!busy && result ? (
        <View>
          <View style={styles.metricGrid}>
            {summaryCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Published Result</Text>
              <Text style={styles.rowMeta}>
                Rank {currentSummary.rank ?? "--"} | {currentSummary.published_date ? formatDisplayDate(currentSummary.published_date) : "Not published"}
              </Text>
            </View>
          </View>

          {termRows.length ? (
            <View style={[styles.list, styles.topGap]}>
              <Text style={styles.sectionTitle}>Term Summary</Text>
              {termRows.map((row) => (
                <View key={row.terminal} style={styles.recordRow}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{row.terminal}</Text>
                    <Text style={styles.rowMeta}>
                      Total {row.summary?.total_max_marks ?? "--"} | Obtained {row.summary?.total_obtained ?? "--"}
                    </Text>
                  </View>
                  <Text style={styles.rowSub}>
                    {row.summary?.percentage !== undefined && row.summary?.percentage !== null ? `${row.summary.percentage}%` : "--"}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.list, styles.topGap]}>
            <Text style={styles.sectionTitle}>Subject Marks</Text>
            {marks.map((mark, index) => (
              <View key={mark.subject_id || `${mark.code || "sub"}-${index}`} style={styles.recordRow}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{mark.subject || mark.subject_name || mark.name || `Subject ${index + 1}`}</Text>
                  <Text style={styles.rowMeta}>
                    {mark.code || mark.subject_code || "-"} | Max {mark.max_marks ?? "--"}
                  </Text>
                  <Text style={styles.rowSub}>
                    Ext {mark.external_marks ?? "--"} | Int {mark.internal_marks ?? "--"} | Total {mark.total_obtained ?? "--"}
                  </Text>
                </View>
                <StatusPill status={mark.status || "Published"} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!busy && !result && !error && !currentLocked ? (
        <EmptyState title="No result" text="Selected terminal ke liye result available nahi hai." />
      ) : null}
    </View>
  );
}

function Notice({ tone, text }) {
  return (
    <View style={[styles.notice, tone === "error" ? styles.noticeError : styles.noticeInfo]}>
      <Text style={styles.noticeText}>{text}</Text>
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

function MetricCard({ label, value, tone }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, styles[`tone_${tone}`]]}>{value}</Text>
    </View>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || "published").toLowerCase();
  return (
    <View style={[styles.statusPill, normalized === "locked" ? styles.statusLocked : styles.statusPublished]}>
      <Text style={styles.statusText}>{status || "Published"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: "#17202a",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  inlineField: {
    marginBottom: 12,
  },
  label: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "900",
  },
  rowMeta: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  rowSub: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  terminalRow: {
    gap: 8,
  },
  terminalButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 54,
    minWidth: 78,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  terminalButtonActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },
  terminalButtonLocked: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    opacity: 0.7,
  },
  terminalText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
  },
  terminalTextActive: {
    color: "#fff",
  },
  terminalTextLocked: {
    color: "#64748b",
  },
  terminalSubtext: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  terminalSubtextActive: {
    color: "#dbeafe",
  },
  terminalSubtextLocked: {
    color: "#94a3b8",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  metricCard: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12,
  },
  metricLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#17202a",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  tone_teal: { color: "#126a6f" },
  tone_green: { color: "#166534" },
  tone_amber: { color: "#92400e" },
  tone_red: { color: "#b91c1c" },
  list: {
    gap: 10,
  },
  topGap: {
    marginTop: 12,
  },
  recordRow: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  statusPill: {
    borderRadius: 999,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPublished: {
    backgroundColor: "#dcfce7",
  },
  statusLocked: {
    backgroundColor: "#dbeafe",
  },
  statusText: {
    color: "#17202a",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "capitalize",
  },
  notice: {
    borderRadius: 10,
    marginBottom: 12,
    padding: 12,
  },
  noticeError: {
    backgroundColor: "#fee2e2",
  },
  noticeInfo: {
    backgroundColor: "#dbeafe",
  },
  noticeText: {
    color: "#17202a",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
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
    paddingVertical: 16,
  },
  loadingText: {
    color: "#126a6f",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
});
