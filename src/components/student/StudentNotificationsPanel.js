import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { getStudentNotifications, markStudentNotificationRead } from "../../api/client";

const DEFAULT_PAGE_SIZE = 4;
const BILL_TYPES = new Set(["bill_generated", "opening_balance"]);
const INVOICE_TYPES = new Set(["fee_payment", "payment", "advance_payment", "dues_payment"]);
const PAYMENT_SOURCE_TYPES = new Set(["fee_payments", "fee_payment", "advance_ledger", "previous_dues"]);

const currency = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const formatMoney = (value) => `Rs. ${currency.format(Number(value || 0))}`;

const prettyLabel = (value) =>
  String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const flattenDetails = (data = {}) => {
  const rows = [];

  if (data.month) rows.push(["Month", data.month]);

  const student = data.student || {};
  if (student.name) rows.push(["Student", student.name]);
  if (student.class || student.section) {
    rows.push(["Class", `Class ${student.class || "-"}${student.section ? `-${student.section}` : ""}`]);
  }
  if (student.roll_no || student.rollNo) rows.push(["Roll", student.roll_no || student.rollNo]);

  const payment = data.payment || {};
  if (payment.payment_mode) rows.push(["Mode", prettyLabel(payment.payment_mode)]);
  if (payment.amount_paid !== undefined) rows.push(["Paid", formatMoney(payment.amount_paid)]);
  if (data.total_amount !== undefined) rows.push(["Total", formatMoney(data.total_amount)]);
  if (data.net_payable !== undefined) rows.push(["Net Payable", formatMoney(data.net_payable)]);
  if (data.remaining !== undefined) rows.push(["Remaining", formatMoney(data.remaining)]);
  if (data.advance_used !== undefined) rows.push(["Advance Used", formatMoney(data.advance_used)]);
  if (payment.receipt_no) rows.push(["Receipt", payment.receipt_no]);
  if (payment.transaction_id) rows.push(["Transaction", payment.transaction_id]);

  return rows;
};

const getFeedType = (notification = {}) => {
  const type = String(notification.notification_type || "").toLowerCase();
  const sourceType = String(notification.source_type || "").toLowerCase();
  const data = notification.notification_data || {};
  const hasPaymentPayload =
    Boolean(data.payment) ||
    data.amount_paid !== undefined ||
    data.receipt_no ||
    data.transaction_id;
  if (BILL_TYPES.has(type)) return "bills";
  if (INVOICE_TYPES.has(type) || PAYMENT_SOURCE_TYPES.has(sourceType) || hasPaymentPayload) return "invoices";
  return "bills";
};

const getPaymentInstruction = (notification = {}) => {
  const type = String(notification.notification_type || "").toLowerCase();
  const sourceType = String(notification.source_type || "").toLowerCase();
  if (!BILL_TYPES.has(type) && !PAYMENT_SOURCE_TYPES.has(sourceType)) return "";

  return (
    notification.notification_data?.payment_instruction ||
    "Please complete the payment within 5 days from the bill generation date."
  );
};

export default function StudentNotificationsPanel({ session, limit = DEFAULT_PAGE_SIZE }) {
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), 10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [activeFeed, setActiveFeed] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);

  const billNotifications = useMemo(
    () => notifications.filter((notification) => getFeedType(notification) === "bills"),
    [notifications],
  );

  const invoiceNotifications = useMemo(
    () => notifications.filter((notification) => getFeedType(notification) === "invoices"),
    [notifications],
  );

  const resolvedFeed = activeFeed || getFeedType(notifications[0] || {});
  const visibleNotifications = resolvedFeed === "bills" ? billNotifications : invoiceNotifications;
  const visibleUnreadCount = visibleNotifications.filter((notification) => !notification.is_read).length;
  const activeTitle = resolvedFeed === "bills" ? "Bills" : "Invoices";
  const emptyText =
    resolvedFeed === "bills"
      ? "Bill generate hote hi yahan notification dikhega."
      : "Payment ke baad invoice notification yahan dikhega.";

  useEffect(() => {
    if (activeFeed == null && notifications.length) {
      setActiveFeed(getFeedType(notifications[0] || {}));
    }
  }, [activeFeed, notifications]);

  const loadPage = useCallback(
    async ({ append = false, offset = 0 } = {}) => {
      if (!session?.token) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await getStudentNotifications(session.token, {
          limit: pageSize,
          offset,
        });

        const items = Array.isArray(response?.notifications) ? response.notifications : [];
        const pagination = response?.pagination || {};
        const resolvedHasMore =
          typeof pagination.has_more === "boolean" ? pagination.has_more : items.length === pageSize;

        setNotifications((current) => (append ? [...current, ...items] : items));
        setHasMore(resolvedHasMore);
        setNextOffset(typeof pagination.next_offset === "number" ? pagination.next_offset : offset + items.length);
      } catch (err) {
        setError(err?.message || "Notifications load failed");
        if (!append) {
          setNotifications([]);
          setHasMore(false);
          setNextOffset(0);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [pageSize, session?.token],
  );

  useEffect(() => {
    loadPage({ append: false, offset: 0 });
  }, [loadPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage({ append: false, offset: 0 });
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    await loadPage({ append: true, offset: nextOffset });
  }, [hasMore, loadPage, loadingMore, nextOffset]);

  const toggleExpanded = useCallback((notificationId) => {
    setExpandedIds((current) =>
      current.includes(notificationId)
        ? current.filter((id) => id !== notificationId)
        : [...current, notificationId],
    );
  }, []);

  const markRead = useCallback(
    async (notificationId) => {
      if (!session?.token || !notificationId) return;

      const current = notifications.find((item) => item.id === notificationId);
      const wasUnread = current ? !current.is_read : false;

      try {
        await markStudentNotificationRead(session.token, notificationId);
        setNotifications((items) =>
          items.map((item) =>
            item.id === notificationId
              ? { ...item, is_read: true, read_at: new Date().toISOString() }
              : item,
          ),
        );
        if (wasUnread) {
          // No-op for now: unread badge is derived from visible notifications.
        }
      } catch (err) {
        setError(err?.message || "Notification update failed");
      }
    },
    [notifications, session?.token],
  );

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionSubtitle}>
            {activeFeed === "bills" ? "Bill updates" : "Invoice updates"} | Latest first
          </Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{visibleUnreadCount} unread</Text>
          </View>
          <Pressable onPress={refresh} style={styles.refreshButton}>
            {refreshing ? <ActivityIndicator color="#0f5f63" size="small" /> : <Text style={styles.refreshText}>Refresh</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.feedTabsRow}>
        <Pressable
          onPress={() => setActiveFeed("bills")}
          style={[styles.feedTab, resolvedFeed === "bills" && styles.feedTabActive]}
        >
          <Text style={[styles.feedTabText, resolvedFeed === "bills" && styles.feedTabTextActive]}>Bills</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveFeed("invoices")}
          style={[styles.feedTab, resolvedFeed === "invoices" && styles.feedTabActive]}
        >
          <Text style={[styles.feedTabText, resolvedFeed === "invoices" && styles.feedTabTextActive]}>Invoices</Text>
        </Pressable>
      </View>

      {loading ? <LoadingBlock label="Notifications loading..." /> : null}
      {error ? <Notice tone="error" text={error} /> : null}

      {!loading && visibleNotifications.length ? (
        <View style={styles.list}>
          {visibleNotifications.map((notification) => {
            const type = String(notification.notification_type || "").toLowerCase();
            const isBillNotification = BILL_TYPES.has(type);
            const isExpanded = isBillNotification ? expandedIds.includes(notification.id) : true;
            const details = flattenDetails(notification.notification_data || {});
            const unread = !notification.is_read;
            const paymentInstruction = getPaymentInstruction(notification);
            const dueAmount =
              notification.notification_data?.remaining ??
              notification.notification_data?.due ??
              notification.notification_data?.net_payable ??
              null;

            return (
              <Pressable
                key={notification.id}
                onPress={() => markRead(notification.id)}
                style={[styles.card, unread && styles.cardUnread]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleBlock}>
                    <Text style={styles.cardTitle}>{notification.title || "Notification"}</Text>
                    <Text style={styles.cardMeta}>
                      {prettyLabel(notification.notification_type)}
                      {notification.source_type ? ` • ${prettyLabel(notification.source_type)}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, unread ? styles.statusUnread : styles.statusRead]}>
                    <Text style={styles.statusText}>{unread ? "Unread" : "Read"}</Text>
                  </View>
                </View>

                <Text style={styles.body}>{notification.body || "-"}</Text>

                {isBillNotification && dueAmount !== null && dueAmount !== undefined ? (
                  <View style={styles.dueBox}>
                    <Text style={styles.dueLabel}>Due</Text>
                    <Text style={styles.dueValue}>{formatMoney(dueAmount)}</Text>
                  </View>
                ) : null}

                {paymentInstruction ? (
                  isExpanded ? (
                    <View style={styles.instructionBox}>
                      <Text style={styles.instructionLabel}>Payment Instruction</Text>
                      <Text style={styles.instructionText}>{paymentInstruction}</Text>
                    </View>
                  ) : null
                ) : null}

                {isExpanded && details.length ? (
                  <View style={styles.detailGrid}>
                    {details.map(([label, value]) => (
                      <View key={`${notification.id}-${label}`} style={styles.detailItem}>
                        <Text style={styles.detailLabel}>{label}</Text>
                        <Text style={styles.detailValue}>{String(value || "-")}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {isBillNotification ? (
                  <Pressable
                    onPress={() => toggleExpanded(notification.id)}
                    style={styles.expandButton}
                  >
                    <Text style={styles.expandButtonText}>
                      {isExpanded ? "Hide details" : "Show details"}
                    </Text>
                  </Pressable>
                ) : null}

              

                <Text style={styles.time}>
                  {notification.created_at ? new Date(notification.created_at).toLocaleString("en-IN") : "-"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!loading && !visibleNotifications.length ? (
        <EmptyState
          title={`No ${activeTitle.toLowerCase()}`}
          text={emptyText}
        />
      ) : null}

      {hasMore ? (
        <Pressable
          disabled={loadingMore}
          onPress={loadMore}
          style={[styles.loadMoreButton, loadingMore && styles.disabledButton]}
        >
          {loadingMore ? (
            <ActivityIndicator color="#0f5f63" />
          ) : (
            <Text style={styles.loadMoreText}>Load more</Text>
          )}
        </Pressable>
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

const styles = StyleSheet.create({
  panel: {
    gap: 10,
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
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  counterPill: {
    backgroundColor: "#e6f6f5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  counterText: {
    color: "#0f5f63",
    fontSize: 12,
    fontWeight: "900",
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshText: {
    color: "#0f5f63",
    fontSize: 12,
    fontWeight: "900",
  },
  feedTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  feedTab: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  feedTabActive: {
    backgroundColor: "#0f5f63",
    borderColor: "#0f5f63",
  },
  feedTabText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  feedTabTextActive: {
    color: "#fff",
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
  cardUnread: {
    borderColor: "#0f5f63",
    shadowColor: "#0f5f63",
    shadowOpacity: 0.12,
    shadowRadius: 12,
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
    fontSize: 15,
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
    paddingVertical: 5,
  },
  statusUnread: {
    backgroundColor: "#e6f6f5",
  },
  statusRead: {
    backgroundColor: "#edf2f7",
  },
  statusText: {
    color: "#0f5f63",
    fontSize: 11,
    fontWeight: "900",
  },
  body: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
    lineHeight: 19,
  },
  instructionBox: {
    backgroundColor: "#fff8e6",
    borderColor: "#f3d48a",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
  },
  instructionLabel: {
    color: "#8a5a00",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  instructionText: {
    color: "#5f4700",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
  },
  dueBox: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dueLabel: {
    color: "#991b1b",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  dueValue: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "900",
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  detailItem: {
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
  expandButton: {
    alignSelf: "flex-start",
    backgroundColor: "#f8fafc",
    borderColor: "#dbe4f0",
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  expandButtonText: {
    color: "#0f5f63",
    fontSize: 12,
    fontWeight: "900",
  },
  moreDetails: {
    color: "#52606d",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  time: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 10,
  },
  notice: {
    borderRadius: 12,
    marginBottom: 10,
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
    marginTop: 6,
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
  loadMoreButton: {
    alignItems: "center",
    backgroundColor: "#e6f6f5",
    borderColor: "#b7e7e4",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
  },
  loadMoreText: {
    color: "#0f5f63",
    fontSize: 13,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.65,
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
    marginBottom: 10,
    padding: 14,
  },
  loadingText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "800",
  },
});
