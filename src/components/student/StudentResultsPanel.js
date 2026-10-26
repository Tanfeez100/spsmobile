import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatDisplayDate, getDefaultAcademicYear } from "../../utils/date";
import { getStudentResultAvailability, getStudentResultPublic } from "../../api/client";
import { colors } from "../../theme/colors";

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
  const academicYear =
    String(student?.academicYear || student?.academic_year || "").trim() || getDefaultAcademicYear();

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
      <View style={styles.sectionTitleRow}>
        <Feather name="bar-chart-2" size={18} color="#1458bf" />
        <Text style={styles.sectionTitle}>Results</Text>
      </View>
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
              <View style={styles.sectionTitleRow}>
                <Feather name="layers" size={18} color="#1458bf" />
                <Text style={styles.sectionTitle}>Term Summary</Text>
              </View>
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
            <View style={styles.sectionTitleRow}>
              <Feather name="book-open" size={18} color="#1458bf" />
              <Text style={styles.sectionTitle}>Subject Marks</Text>
            </View>
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

function MetricCard({ label, value, tone }) {
  const iconName =
    label === "Total"
      ? "bar-chart-2"
      : label === "Obtained"
      ? "check-circle"
      : label === "Percent"
      ? "percent"
      : "shield";
  const iconColor = tone === "green" ? "#16a34a" : tone === "red" ? "#ef4444" : tone === "amber" ? "#f59e0b" : "#1458bf";

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>
        <Feather name={iconName} size={18} color={iconColor} />
      </View>
      <View style={styles.metricBody}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, styles[`tone_${tone}`]]}>{value}</Text>
      </View>
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
    color: colors.primaryDeep,
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
  inlineField: {
    marginBottom: 12,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginBottom: 7,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  rowSub: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  terminalRow: {
    gap: 8,
  },
  terminalButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 58,
    minWidth: 78,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  terminalButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  terminalButtonLocked: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    opacity: 0.7,
  },
  terminalText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "900",
  },
  terminalTextActive: {
    color: colors.white,
  },
  terminalTextLocked: {
    color: colors.textLight,
  },
  terminalSubtext: {
    color: colors.textLight,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  terminalSubtextActive: {
    color: colors.tintBorder,
  },
  terminalSubtextLocked: {
    color: colors.textLight,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  metricCard: {
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: 12,
    padding: 16,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricIconWrap: {
    alignItems: "center",
    backgroundColor: colors.tintSoft,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  metricBody: {
    flex: 1,
  },
  metricValue: {
    color: colors.primaryDeep,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 8,
  },
  tone_teal: { color: colors.primaryDark },
  tone_green: { color: colors.success },
  tone_amber: { color: colors.warning },
  tone_red: { color: colors.danger },
  list: {
    gap: 10,
  },
  topGap: {
    marginTop: 12,
  },
  recordRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  statusPill: {
    borderRadius: 999,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPublished: {
    backgroundColor: colors.successBg,
  },
  statusLocked: {
    backgroundColor: colors.tintSoft,
  },
  statusText: {
    color: colors.textPrimary,
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
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  noticeInfo: {
    backgroundColor: colors.tintSoft,
    borderColor: colors.tintBorder,
  },
  noticeText: {
    color: colors.primaryDeep,
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
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  loadingBlock: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 18,
  },
  loadingText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
});
