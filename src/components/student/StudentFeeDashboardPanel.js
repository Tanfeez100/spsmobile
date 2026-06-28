import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getStudentFeeDashboard } from "../../api/client";

const currency = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const formatMoney = (value) => `Rs. ${currency.format(Number(value || 0))}`;

const formatMonth = (value) => {
  if (!value) return "-";
  const parsed = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(parsed);
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
};

const getCurrentYear = () => String(new Date().getFullYear());

const statusTone = {
  paid: { backgroundColor: "#dcfce7", color: "#166534" },
  partial: { backgroundColor: "#fef3c7", color: "#92400e" },
  unpaid: { backgroundColor: "#fee2e2", color: "#991b1b" },
};

export default function StudentFeeDashboardPanel({ session, student }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(getCurrentYear());
  const [yearOptions, setYearOptions] = useState([getCurrentYear()]);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);

  useEffect(() => {
    if (!session?.token) return undefined;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getStudentFeeDashboard(session.token, { year });
        if (cancelled) return;
        setYear(String(response?.year || year));
        setYearOptions(Array.isArray(response?.year_options) && response.year_options.length ? response.year_options : [year]);
        setSummary(response?.summary || null);
        setHistory(Array.isArray(response?.history) ? response.history : []);
        setPaymentHistory(Array.isArray(response?.payment_history) ? response.payment_history : []);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Fee dashboard load failed");
        setSummary(null);
        setHistory([]);
        setPaymentHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [session?.token, year]);

  const cards = useMemo(
    () => [
      { label: "Total Billed", value: formatMoney(summary?.total_amount || 0), tone: "teal" },
      { label: "Total Paid", value: formatMoney(summary?.total_paid || 0), tone: "green" },
      { label: "Due", value: formatMoney(summary?.total_due || 0), tone: "red" },
      { label: "Bills", value: summary?.months || 0, tone: "amber" },
    ],
    [summary],
  );

  const derivedPaymentHistory = useMemo(() => {
    const payments = (history || [])
      .flatMap((bill) =>
        (bill.payments || []).map((payment) => ({
          id: payment.id || `${bill.bill_id}-${payment.payment_date || payment.created_at || "payment"}-${payment.transaction_id || payment.receipt_no || ""}`,
          bill_id: bill.bill_id,
          invoice_number: bill.invoice_number,
          month: bill.month,
          payment_date: payment.payment_date || payment.created_at,
          amount_paid: payment.amount_paid,
          payment_mode: payment.payment_mode,
          transaction_id: payment.transaction_id || null,
          receipt_no: payment.receipt_no || null,
        })),
      )
      .sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")));

    return payments;
  }, [history]);

  const visiblePaymentHistory = useMemo(() => {
    const source = paymentHistory.length ? paymentHistory : derivedPaymentHistory;
    return [...source].sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")));
  }, [paymentHistory, derivedPaymentHistory]);

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.sectionTitle}>Fee Dashboard</Text>
          <Text style={styles.sectionSubtitle}>
            {student?.name ? `${student.name} • ` : ""}
            Year-wise fee history
          </Text>
        </View>
      </View>

      <View style={styles.yearRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearChips}>
          {yearOptions.map((option) => {
            const active = String(option) === String(year);
            return (
              <Pressable
                key={option}
                onPress={() => setYear(String(option))}
                style={[styles.yearChip, active && styles.yearChipActive]}
              >
                <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>{option}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <LoadingBlock label="Fee dashboard loading..." />
      ) : null}

      {error ? <Notice tone="error" text={error} /> : null}

      {!loading && summary ? (
        <View style={styles.metricGrid}>
          {cards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </View>
      ) : null}

      {!loading && visiblePaymentHistory.length ? (
        <View style={styles.paymentHistoryBlock}>
          <Text style={styles.paymentHistoryTitle}>Payment History</Text>
          <Text style={styles.paymentHistorySubtitle}>Month-wise payment records</Text>
          <View style={styles.paymentHistoryList}>
            {visiblePaymentHistory.map((payment) => (
              <View key={payment.id} style={styles.paymentHistoryCard}>
                <View style={styles.paymentHistoryHeader}>
                  <View style={styles.paymentHistoryBody}>
                    <Text style={styles.paymentHistoryMonth}>{formatMonth(payment.month)}</Text>
                    <Text style={styles.paymentHistoryMeta}>
                      {formatDate(payment.payment_date)} • {String(payment.payment_mode || "-").replace(/_/g, " ")}
                    </Text>
                  </View>
                  <Text style={styles.paymentHistoryAmount}>{formatMoney(payment.amount_paid)}</Text>
                </View>

                <View style={styles.paymentSummaryGrid}>
                  <DetailPill label="Total" value={formatMoney(payment.total_amount)} />
                  <DetailPill label="Paid" value={formatMoney(payment.total_paid)} />
                  <DetailPill label="Remaining" value={formatMoney(payment.remaining)} />
                  <DetailPill label="Status" value={String(payment.bill_status || "-").toUpperCase()} />
                </View>

                <View style={styles.paymentHistoryFooter}>
                  <Text style={styles.paymentHistoryFootText}>{payment.invoice_number || "Invoice"}</Text>
                  <Text style={styles.paymentHistoryFootText}>
                    {payment.receipt_no
                      ? `Receipt: ${payment.receipt_no}`
                      : payment.transaction_id
                      ? `Txn: ${payment.transaction_id}`
                      : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!loading && history.length ? (
        <View style={styles.list}>
          {history.map((bill) => {
            const tone = statusTone[String(bill.bill_status || "unpaid").toLowerCase()] || statusTone.unpaid;
            const detailItems = Array.isArray(bill.items) ? bill.items.slice(0, 3) : [];

            return (
              <View key={bill.bill_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleBlock}>
                    <Text style={styles.cardTitle}>{formatMonth(bill.month)}</Text>
                    <Text style={styles.cardMeta}>
                      {bill.invoice_number} • {bill.payment_count || 0} payment{bill.payment_count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                    <Text style={[styles.statusText, { color: tone.color }]}>
                      {String(bill.bill_status || "unpaid").toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailGrid}>
                  <DetailPill label="Billed" value={formatMoney(bill.total_amount)} />
                  <DetailPill label="Paid" value={formatMoney(bill.paid_amount)} />
                  <DetailPill label="Due" value={formatMoney(bill.remaining)} />
                  <DetailPill label="Advance" value={formatMoney(bill.advance_used)} />
                </View>

                {bill.latest_payment ? (
                  <View style={styles.latestRow}>
                    <Text style={styles.latestLabel}>Latest payment</Text>
                    <Text style={styles.latestValue}>
                      {formatDate(bill.latest_payment.payment_date)} • {formatMoney(bill.latest_payment.amount_paid)} •{" "}
                      {String(bill.latest_payment.payment_mode || "-").replace(/_/g, " ")}
                    </Text>
                  </View>
                ) : null}

                {detailItems.length ? (
                  <View style={styles.itemsBlock}>
                    <Text style={styles.itemsLabel}>Items</Text>
                    {detailItems.map((item) => (
                      <View key={`${bill.bill_id}-${item.fee_name}`} style={styles.itemRow}>
                        <Text style={styles.itemName}>{item.fee_name}</Text>
                        <Text style={styles.itemAmount}>{formatMoney(item.amount)}</Text>
                      </View>
                    ))}
                    {bill.items_count > detailItems.length ? (
                      <Text style={styles.moreText}>+{bill.items_count - detailItems.length} more items</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {!loading && !history.length && !visiblePaymentHistory.length ? (
        <EmptyState
          title="No fee history"
          text="Is year ke liye fee bills abhi available nahi hain."
        />
      ) : null}
    </View>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <View style={[styles.metricCard, styles[`metric_${tone}`]]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function DetailPill({ label, value }) {
  return (
    <View style={styles.detailPill}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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

const styles = StyleSheet.create({
  panel: {
    gap: 12,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
  },
  sectionTitle: {
    color: "#17202a",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  yearRow: {
    marginBottom: 2,
  },
  yearChips: {
    gap: 8,
    paddingRight: 4,
  },
  yearChip: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  yearChipActive: {
    backgroundColor: "#0f5f63",
    borderColor: "#0f5f63",
  },
  yearChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  yearChipTextActive: {
    color: "#fff",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    borderRadius: 16,
    minHeight: 88,
    padding: 14,
    width: "48%",
  },
  metric_teal: {
    backgroundColor: "#e0f2fe",
  },
  metric_green: {
    backgroundColor: "#dcfce7",
  },
  metric_red: {
    backgroundColor: "#fee2e2",
  },
  metric_amber: {
    backgroundColor: "#fef3c7",
  },
  metricLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 8,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  titleBlock: {
    flex: 1,
  },
  cardTitle: {
    color: "#17202a",
    fontSize: 16,
    fontWeight: "900",
  },
  cardMeta: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  detailPill: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    minWidth: "47%",
    padding: 10,
  },
  detailLabel: {
    color: "#52606d",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#17202a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  latestRow: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
  },
  latestLabel: {
    color: "#52606d",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  latestValue: {
    color: "#17202a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  itemsBlock: {
    marginTop: 12,
  },
  itemsLabel: {
    color: "#52606d",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  itemRow: {
    alignItems: "center",
    borderBottomColor: "#eef2f7",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  itemName: {
    color: "#17202a",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  itemAmount: {
    color: "#0f5f63",
    fontSize: 12,
    fontWeight: "900",
  },
  moreText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  notice: {
    borderRadius: 12,
    marginBottom: 2,
    padding: 10,
  },
  noticeError: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
  },
  noticeInfo: {
    backgroundColor: "#ecfeff",
    borderColor: "#a5f3fc",
    borderWidth: 1,
  },
  noticeText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
    padding: 18,
  },
  emptyTitle: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  paymentHistoryBlock: {
    gap: 8,
    marginTop: 6,
  },
  paymentHistoryTitle: {
    color: "#17202a",
    fontSize: 17,
    fontWeight: "900",
  },
  paymentHistorySubtitle: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  paymentHistoryList: {
    gap: 10,
    marginTop: 4,
  },
  paymentHistoryCard: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  paymentHistoryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  paymentHistoryBody: {
    flex: 1,
    minWidth: 0,
  },
  paymentHistoryMonth: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "900",
  },
  paymentHistoryMeta: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  paymentHistoryAmount: {
    color: "#0f5f63",
    fontSize: 14,
    fontWeight: "900",
  },
  paymentHistoryFooter: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 8,
  },
  paymentSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  paymentHistoryFootText: {
    color: "#64748b",
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  loadingBlock: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 4,
    padding: 14,
  },
  loadingText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "800",
  },
});
