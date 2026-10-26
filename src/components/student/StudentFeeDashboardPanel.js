import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getStudentFeeDashboard } from "../../api/client";
import { colors } from "../../theme/colors";

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
  paid: { backgroundColor: colors.successBg, color: colors.successText },
  partial: { backgroundColor: colors.warningBg, color: colors.warningText },
  unpaid: { backgroundColor: colors.dangerBg, color: colors.dangerText },
};

export default function StudentFeeDashboardPanel({ session, student }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(getCurrentYear());
  const [activeTab, setActiveTab] = useState("bill");
  const [expandedBills, setExpandedBills] = useState({});
  const [expandedPayments, setExpandedPayments] = useState({});
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
      { label: "Bills", value: summary?.months || history.length || 0, tone: "amber" },
    ],
    [summary, history.length],
  );

  const billRows = useMemo(() => [...history].sort((a, b) => String(b.month || "").localeCompare(String(a.month || ""))), [history]);

  const paidBillRows = useMemo(
    () => billRows.filter((bill) => String(bill.bill_status || "").toLowerCase() === "paid"),
    [billRows],
  );

  const paidPaymentRows = useMemo(
    () =>
      paidBillRows.map((bill) => {
        const latestPayment = bill.latest_payment || null;
        return {
          id: bill.bill_id,
          month: bill.month,
          payment_date: latestPayment?.payment_date || bill.paid_at || bill.updated_at || bill.created_at,
          payment_mode: latestPayment?.payment_mode || bill.payment_mode || bill.mode || "cash",
          amount_paid: bill.paid_amount || bill.total_paid || bill.total_amount,
          total_amount: bill.total_amount,
          total_paid: bill.paid_amount || bill.total_paid || bill.total_amount,
          remaining: bill.remaining,
          bill_status: bill.bill_status || "paid",
          invoice_number: bill.invoice_number,
          receipt_no: latestPayment?.receipt_no || bill.receipt_no || null,
          transaction_id: latestPayment?.transaction_id || bill.transaction_id || null,
        };
      }),
    [paidBillRows],
  );

  const toggleBillExpanded = (billId) => {
    setExpandedBills((prev) => ({
      ...prev,
      [billId]: !prev[billId],
    }));
  };

  const togglePaymentExpanded = (paymentId) => {
    setExpandedPayments((prev) => ({
      ...prev,
      [paymentId]: !prev[paymentId],
    }));
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextBlock}>
          <View style={styles.sectionTitleRow}>
            <Feather name="credit-card" size={18} color={colors.primaryDark} />
            <Text style={styles.sectionTitle}>Fee Dashboard</Text>
          </View>
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

      <View style={styles.feeTabRow}>
        <Pressable
          onPress={() => setActiveTab("bill")}
          style={[styles.feeTabButton, activeTab === "bill" && styles.feeTabButtonActive]}
        >
          <Text style={[styles.feeTabText, activeTab === "bill" && styles.feeTabTextActive]}>Bill</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("payment")}
          style={[styles.feeTabButton, activeTab === "payment" && styles.feeTabButtonActive]}
        >
          <Text style={[styles.feeTabText, activeTab === "payment" && styles.feeTabTextActive]}>
            Payment History
          </Text>
        </Pressable>
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

      {!loading && activeTab === "payment" && paidPaymentRows.length ? (
        <View style={styles.paymentHistoryBlock}>
          <View style={styles.sectionTitleRow}>
            <Feather name="wallet" size={18} color="#1458bf" />
            <Text style={styles.paymentHistoryTitle}>Payment History</Text>
          </View>
          <Text style={styles.paymentHistorySubtitle}>Sirf paid bills dikhaye gaye hain</Text>
          <View style={styles.paymentHistoryList}>
            {paidPaymentRows.map((payment) => (
              <View key={payment.id} style={styles.paymentHistoryCard}>
                <Pressable onPress={() => togglePaymentExpanded(payment.id)} style={styles.expandCardHeader}>
                  <View style={styles.paymentHistoryBody}>
                    <Text style={styles.paymentHistoryMonth}>{formatMonth(payment.month)}</Text>
                    <Text style={styles.paymentHistoryMeta}>
                      {formatDate(payment.payment_date)} • {String(payment.payment_mode || "-").replace(/_/g, " ")}
                    </Text>
                  </View>
                  <View style={styles.expandHeaderRight}>
                    <Text style={styles.paymentHistoryAmount}>{formatMoney(payment.amount_paid)}</Text>
                    <Feather
                      name={expandedPayments[payment.id] ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#1458bf"
                    />
                  </View>
                </Pressable>

                {!expandedPayments[payment.id] ? (
                  <View style={styles.paymentCollapsedSummary}>
                    <Text style={styles.paymentCollapsedText}>
                      {payment.invoice_number || "Invoice"} • Tap to view full payment details
                    </Text>
                  </View>
                ) : (
                  <>
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
                  </>
                )}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!loading && activeTab === "bill" && billRows.length ? (
        <View style={styles.list}>
          {billRows.map((bill) => {
            const detailItems = Array.isArray(bill.items) ? bill.items.slice(0, 3) : [];

            return (
              <View key={bill.bill_id} style={styles.card}>
                <Pressable onPress={() => toggleBillExpanded(bill.bill_id)} style={styles.expandCardHeader}>
                  <View style={styles.titleBlock}>
                    <Text style={styles.cardTitle}>{formatMonth(bill.month)}</Text>
                    <Text style={styles.cardMeta}>
                      {bill.invoice_number || "Bill"} • Generated bill
                    </Text>
                  </View>
                  <View style={styles.expandHeaderRight}>
                    <Text style={styles.expandHeaderLabel}>
                      {bill.items_count || detailItems.length || 0} item{(bill.items_count || detailItems.length || 0) === 1 ? "" : "s"}
                    </Text>
                    <Feather
                      name={expandedBills[bill.bill_id] ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#1458bf"
                    />
                  </View>
                </Pressable>

                {!expandedBills[bill.bill_id] ? (
                  <View style={styles.billCollapsedSummary}>
                    <DetailPill label="Billed Amount" value={formatMoney(bill.total_amount)} />
                    <DetailPill label="Due" value={formatMoney(bill.remaining)} />
                  </View>
                ) : (
                  <>
                    <View style={styles.detailGrid}>
                      <DetailPill label="Billed Amount" value={formatMoney(bill.total_amount)} />
                      <DetailPill label="Due" value={formatMoney(bill.remaining)} />
                      <DetailPill label="Items" value={bill.items_count || detailItems.length || 0} />
                      <DetailPill label="Status" value="BILLED" />
                    </View>

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
                  </>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {!loading && !billRows.length && !paidPaymentRows.length ? (
        <EmptyState
          title="No fee history"
          text="Is year ke liye fee bills abhi available nahi hain."
        />
      ) : null}
    </View>
  );
}

function MetricCard({ label, value, tone }) {
  const iconName =
    label === "Total Billed"
      ? "file-text"
      : label === "Total Paid"
      ? "check-circle"
      : label === "Due"
      ? "alert-circle"
      : "calendar";
  const iconColor = tone === "green" ? "#16a34a" : tone === "red" ? "#ef4444" : tone === "amber" ? "#f59e0b" : "#1458bf";

  return (
    <View style={[styles.metricCard, styles[`metric_${tone}`]]}>
      <View style={styles.metricIconWrap}>
        <Feather name={iconName} size={18} color={iconColor} />
      </View>
      <View style={styles.metricBody}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
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
      <ActivityIndicator color={colors.primaryDark} />
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
    color: colors.primaryDeep,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  sectionSubtitle: {
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  yearChipActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  yearChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "900",
  },
  yearChipTextActive: {
    color: colors.white,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  feeTabRow: {
    backgroundColor: colors.tintSoft,
    borderColor: colors.tintBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    padding: 4,
  },
  feeTabButton: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  feeTabButtonActive: {
    backgroundColor: colors.primaryDark,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  feeTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "900",
  },
  feeTabTextActive: {
    color: colors.white,
  },
  metricCard: {
    alignItems: "center",
    borderColor: colors.cardBorder,
    flexDirection: "row",
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    minHeight: 102,
    padding: 16,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    width: "48%",
    elevation: 2,
  },
  metricIconWrap: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  metricBody: {
    flex: 1,
  },
  metric_teal: {
    backgroundColor: colors.tintSoft,
  },
  metric_green: {
    backgroundColor: "#ecfbf1",
  },
  metric_red: {
    backgroundColor: "#fff1f0",
  },
  metric_amber: {
    backgroundColor: "#fff7e5",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricValue: {
    color: colors.primaryDeep,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 10,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  expandCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  titleBlock: {
    flex: 1,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  cardMeta: {
    color: colors.textMuted,
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
  expandHeaderRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  expandHeaderLabel: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "900",
  },
  billCollapsedSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  paymentCollapsedSummary: {
    backgroundColor: colors.tintSoft,
    borderColor: colors.tintBorder,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paymentCollapsedText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  detailPill: {
    backgroundColor: colors.tintSoft,
    borderColor: colors.tintBorder,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: "47%",
    padding: 10,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  latestRow: {
    backgroundColor: colors.tintSoft,
    borderColor: colors.tintBorder,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
  },
  latestLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  latestValue: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  itemsBlock: {
    marginTop: 12,
  },
  itemsLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  itemRow: {
    alignItems: "center",
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  itemName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  itemAmount: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
  moreText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  notice: {
    borderRadius: 18,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
  },
  noticeInfo: {
    backgroundColor: colors.tintSoft,
    borderColor: colors.tintBorder,
    borderWidth: 1,
  },
  noticeText: {
    color: colors.primaryDeep,
    fontSize: 12,
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
    marginTop: 4,
    padding: 22,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.textMuted,
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
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "900",
  },
  paymentHistorySubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  paymentHistoryList: {
    gap: 10,
    marginTop: 4,
  },
  paymentHistoryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
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
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  paymentHistoryMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  paymentHistoryAmount: {
    color: colors.primaryDark,
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
    color: colors.textMuted,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  loadingBlock: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 4,
    padding: 14,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
});
