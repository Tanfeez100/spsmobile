import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import {
  getAttendanceBootstrap,
  getAttendanceRecords,
  getHolidayCalendar,
  getMarks,
  getStudentAttendance,
  getStudents,
  getSubjectsForClass,
  loginStudent,
  loginTeacher,
  registerAuthRefreshHandler,
  refreshTeacherToken,
  saveAttendance,
  submitMarks,
} from "./src/api/client";
import { clearSession, loadSession, saveSession } from "./src/storage/session";
import { formatDisplayDate, getDefaultAcademicYear, monthIso, todayIso } from "./src/utils/date";

const schoolLogo = require("./src/assets/logo.png");
const SCHOOL_NAME = "Star Public School";
const SCHOOL_SHORT_NAME = "SPS";
const SCHOOL_TAGLINE = "Learning, discipline and daily progress";

const statusOptions = [
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "late", label: "Late" },
];

const teacherTabs = [
  { key: "home", label: "Home" },
  { key: "students", label: "Students" },
  { key: "attendance", label: "Attendance" },
  { key: "reports", label: "Reports" },
  { key: "history", label: "History" },
  { key: "holidays", label: "Holidays" },
  { key: "submitMarks", label: "Submit Marks" },
  { key: "viewMarks", label: "View Marks" },
];

const teacherFeatures = [
  { key: "attendance", label: "Attendance", meta: "Mark class attendance" },
  { key: "reports", label: "Reports", meta: "Monthly class report" },
  { key: "history", label: "Student History", meta: "Student attendance record" },
  { key: "holidays", label: "Holidays", meta: "School holiday calendar" },
  { key: "submitMarks", label: "Submit Marks", meta: "Enter terminal marks" },
  { key: "viewMarks", label: "View Marks", meta: "Review submitted marks" },
];

const terminals = ["First", "Second", "Third", "Annual"];

const studentTabs = [
  { key: "home", label: "Home" },
  { key: "attendance", label: "Attendance" },
];

const getAccessToken = (data) => data?.session?.access_token || data?.access_token || "";
const getRefreshToken = (data) => data?.session?.refresh_token || data?.refresh_token || "";
const getTokenExpiresAt = (data) => {
  const tokenInfoExpiresAt = data?.token_info?.expires_at;
  if (tokenInfoExpiresAt) return tokenInfoExpiresAt;

  const sessionExpiresAt = data?.session?.expires_at;
  if (typeof sessionExpiresAt === "number") {
    return new Date(sessionExpiresAt * 1000).toISOString();
  }

  const expiresIn = data?.session?.expires_in || data?.expires_in;
  if (Number.isFinite(Number(expiresIn))) {
    return new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
  }

  return new Date(Date.now() + 25 * 60 * 1000).toISOString();
};

const shouldRefreshTeacherSession = (session, leadMs = 2 * 60 * 1000) => {
  if (session?.role !== "teacher" || !session.refreshToken) return false;
  if (!session.tokenExpiresAt) return true;

  const expiresAt = Date.parse(session.tokenExpiresAt);
  if (!Number.isFinite(expiresAt)) return true;

  return expiresAt - Date.now() <= leadMs;
};

const normalizeStudents = (response) => {
  const rows = Array.isArray(response) ? response : response?.students || [];
  return rows.map((student) => {
    const previousDue = Number(student.previous_due || student.previousDue || 0);
    const rawFeeStatus = String(student.fee_status || student.feeStatus || student.payment_status || "").toLowerCase();
    const isPaid = rawFeeStatus === "paid" || rawFeeStatus === "clear" || previousDue <= 0;

    return {
      id: student.id || student.ID,
      name: student.name || student.Name || "",
      fatherName: student.father_name || student.Father || "",
      class: student.class || student.Class || "",
      section: student.section || student.Section || "",
      rollNo: student.roll_no || student.Roll || student.rollNo || "",
      academicYear: student.academic_year || student.AcademicYear || "",
      mobile: student.mobile || student.Mobile || "",
      previousDue,
      feeStatus: isPaid ? "paid" : "due",
    };
  });
};

const summarizeRecords = (records = []) =>
  records.reduce(
    (summary, record) => {
      if (record.status === "present") summary.present += 1;
      if (record.status === "absent") summary.absent += 1;
      if (record.status === "late") summary.late += 1;
      return summary;
    },
    { present: 0, absent: 0, late: 0 },
  );

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSessionState] = useState(null);
  const refreshInFlightRef = useRef(null);

  useEffect(() => {
    loadSession()
      .then(setSessionState)
      .finally(() => setBooting(false));
  }, []);

  const handleSession = async (nextSession) => {
    setSessionState(nextSession);
    await saveSession(nextSession);
  };

  const refreshTeacherSession = useCallback(async (sessionToRefresh = session) => {
    if (sessionToRefresh?.role !== "teacher" || !sessionToRefresh.refreshToken) {
      return sessionToRefresh;
    }

    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = (async () => {
        const response = await refreshTeacherToken(sessionToRefresh.refreshToken);
        const token = getAccessToken(response);
        const refreshToken = getRefreshToken(response) || sessionToRefresh.refreshToken;

        if (!token) {
          throw new Error("Refresh response me token nahi mila.");
        }

        const nextSession = {
          ...sessionToRefresh,
          token,
          refreshToken,
          user: response.user || sessionToRefresh.user,
          tokenExpiresAt: getTokenExpiresAt(response),
          savedAt: new Date().toISOString(),
        };

        setSessionState((current) => {
          if (!current || current.savedAt !== sessionToRefresh.savedAt) return current;
          return nextSession;
        });
        await saveSession(nextSession);
        return nextSession;
      })().finally(() => {
        refreshInFlightRef.current = null;
      });
    }

    return refreshInFlightRef.current;
  }, [session]);

  useEffect(() => {
    if (session?.role !== "teacher" || !session.refreshToken) return undefined;

    return registerAuthRefreshHandler(async () => {
      const refreshedSession = await refreshTeacherSession(session);
      return refreshedSession?.token || "";
    });
  }, [refreshTeacherSession, session]);

  useEffect(() => {
    if (session?.role !== "teacher" || !session.refreshToken) return undefined;

    let refreshTimer;
    let cancelled = false;

    const scheduleRefresh = (activeSession) => {
      if (cancelled || activeSession?.role !== "teacher" || !activeSession.refreshToken) return;

      const expiresAt = Date.parse(activeSession.tokenExpiresAt || "");
      const fallbackMs = 25 * 60 * 1000;
      const refreshInMs = Number.isFinite(expiresAt)
        ? Math.max(expiresAt - Date.now() - 2 * 60 * 1000, 0)
        : 0;

      refreshTimer = setTimeout(async () => {
        try {
          const refreshed = await refreshTeacherSession(activeSession);
          scheduleRefresh(refreshed);
        } catch (error) {
          console.warn("Teacher session refresh failed:", error.message);
          scheduleRefresh({
            ...activeSession,
            tokenExpiresAt: new Date(Date.now() + fallbackMs).toISOString(),
          });
        }
      }, Number.isFinite(expiresAt) ? refreshInMs : 0);
    };

    scheduleRefresh(session);

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [refreshTeacherSession, session]);

  useEffect(() => {
    if (session?.role !== "teacher" || !session.refreshToken) return undefined;

    const refreshIfNeeded = () => {
      if (shouldRefreshTeacherSession(session)) {
        refreshTeacherSession(session).catch((error) => {
          console.warn("Teacher session refresh failed:", error.message);
        });
      }
    };

    refreshIfNeeded();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshIfNeeded();
    });

    return () => subscription.remove();
  }, [refreshTeacherSession, session]);

  const handleLogout = async () => {
    setSessionState(null);
    await clearSession();
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <View style={styles.openingBrandCard}>
          <Image source={schoolLogo} style={styles.openingLogo} resizeMode="contain" />
          <Text style={styles.openingTitle}>{SCHOOL_NAME}</Text>
          <Text style={styles.openingSubtitle}>Mobile School Portal</Text>
        </View>
        <ActivityIndicator color="#0f5f63" size="large" />
        <Text style={styles.loadingText}>Preparing your campus dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      {session ? (
        <Dashboard session={session} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLogin={handleSession} />
      )}
    </SafeAreaView>
  );
}

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("teacher");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!identity.trim() || !password) {
      setError("Login details bharna zaruri hai.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        mode === "teacher"
          ? await loginTeacher(identity.trim(), password)
          : await loginStudent(identity.trim(), password);
      const token = getAccessToken(response);

      if (!token || !response?.user) {
        throw new Error("Login response me token nahi mila.");
      }

      await onLogin({
        role: mode,
        token,
        refreshToken: getRefreshToken(response),
        tokenExpiresAt: mode === "teacher" ? getTokenExpiresAt(response) : null,
        user: response.user,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.loginShell}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.loginContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <View style={styles.logoHalo}>
            <View style={styles.logoMark}>
              <Image source={schoolLogo} style={styles.logoImage} resizeMode="contain" />
            </View>
          </View>
          <Text style={styles.brandKicker}>{SCHOOL_SHORT_NAME} Mobile Portal</Text>
          <Text style={styles.brandTitle}>{SCHOOL_NAME}</Text>
          <Text style={styles.brandSubtitle}>{SCHOOL_TAGLINE}</Text>
          <View style={styles.brandPillRow}>
            <Text style={styles.brandPill}>Teachers</Text>
            <Text style={styles.brandPill}>Students</Text>
            <Text style={styles.brandPill}>Attendance</Text>
          </View>
        </View>

        <View style={styles.segment}>
          <SegmentButton active={mode === "teacher"} label="Teacher" onPress={() => setMode("teacher")} />
          <SegmentButton active={mode === "student"} label="Student" onPress={() => setMode("student")} />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.inputLabel}>{mode === "teacher" ? "Email" : "Username"}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={mode === "teacher" ? "email-address" : "default"}
            onChangeText={setIdentity}
            placeholder={mode === "teacher" ? "teacher@school.com" : "student username"}
            placeholderTextColor="#8a8f98"
            style={styles.input}
            value={identity}
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#8a8f98"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable disabled={loading} onPress={submit} style={[styles.primaryButton, loading && styles.disabledButton]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Login</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Dashboard({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState("home");
  const tabs = session.role === "teacher" ? teacherTabs : studentTabs;

  useEffect(() => {
    setActiveTab("home");
  }, [session.role]);

  return (
    <View style={styles.appShell}>
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <Image source={schoolLogo} style={styles.headerLogo} resizeMode="contain" />
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerSchool}>{SCHOOL_NAME}</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {session.user?.name || session.user?.email || `${SCHOOL_SHORT_NAME} Mobile`}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{session.role === "teacher" ? "Teacher" : "Student"}</Text>
          </View>
          <Pressable onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      {session.role === "teacher" ? (
        <TeacherArea activeTab={activeTab} onTabChange={setActiveTab} session={session} />
      ) : (
        <StudentArea activeTab={activeTab} session={session} />
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroller}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function TeacherArea({ activeTab, onTabChange, session }) {
  const [bootstrap, setBootstrap] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(todayIso());
  const [statuses, setStatuses] = useState({});
  const [selectedDateIsHoliday, setSelectedDateIsHoliday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const assignments = bootstrap?.assignments || [];
  const selectedAssignment = useMemo(() => {
    if (!assignments.length) return null;
    return (
      assignments.find((assignment) => assignmentKey(assignment) === selectedKey) ||
      assignments[0]
    );
  }, [assignments, selectedKey]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      setMessage("");
      setSaved(false);

      try {
        const boot = await getAttendanceBootstrap(session.token);
        setBootstrap(boot);
        const nextAssignments = boot?.assignments || [];
        const nextSelected = nextAssignments.find((item) => assignmentKey(item) === selectedKey) || nextAssignments[0];

        if (nextSelected) {
          setSelectedKey(assignmentKey(nextSelected));
          const scope = assignmentParams(nextSelected);
          const [studentResponse, recordResponse] = await Promise.all([
            getStudents(session.token, scope),
            getAttendanceRecords(session.token, { ...scope, date }),
          ]);
          const normalizedStudents = normalizeStudents(studentResponse);
          const isHolidayDate = Boolean(recordResponse?.isHoliday);
          setStudents(normalizedStudents);
          setRecords(recordResponse?.records || []);
          setSelectedDateIsHoliday(isHolidayDate);
          setStatuses(
            normalizedStudents.reduce((map, student) => {
              const existing = (recordResponse?.records || []).find((record) => record.student_id === student.id);
              map[student.id] = isHolidayDate ? "" : existing?.status || "present";
              return map;
            }, {}),
          );
        } else {
          setStudents([]);
          setRecords([]);
          setStatuses({});
          setSelectedDateIsHoliday(false);
          setMessage(boot?.message || "Aapko abhi class/section assign nahi hua hai.");
        }
      } catch (err) {
        setError(err.message || "Teacher data load failed");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date, selectedKey, session.token],
  );

  useEffect(() => {
    load();
  }, [load]);

  const saveClassAttendance = async () => {
    if (!selectedAssignment) return;
    if (selectedDateIsHoliday) {
      setMessage("Holiday hai. Is date ka attendance record save nahi hoga.");
      return;
    }
    const missing = students.filter((student) => !statuses[student.id]);
    if (missing.length) {
      Alert.alert("Attendance missing", "Sabhi students ka status select karein.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");
    setMessage("");
    try {
      const payload = {
        date,
        ...assignmentParams(selectedAssignment),
        statuses,
      };
      const response = await saveAttendance(session.token, payload);
      await load({ silent: true });
      setMessage(response?.message || "Attendance saved successfully.");
      setSaved(true);
    } catch (err) {
      setSaved(false);
      setError(err.message || "Attendance save failed");
    } finally {
      setSaving(false);
    }
  };

  const refresh = () => {
    setRefreshing(true);
    setSaved(false);
    load({ silent: true });
  };

  if (loading) return <LoadingBlock label="Teacher dashboard loading..." />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {error ? <Notice tone="error" text={error} /> : null}
      {message ? <Notice tone={saved ? "success" : "info"} text={message} /> : null}

      {assignments.length ? (
        <AssignmentPicker
          assignments={assignments}
          selectedKey={assignmentKey(selectedAssignment)}
          onSelect={(nextKey) => {
            setSelectedKey(nextKey);
            setSaved(false);
            setMessage("");
          }}
        />
      ) : null}

      {activeTab === "home" ? (
        <TeacherHome
          assignment={selectedAssignment}
          onOpen={onTabChange}
          records={records}
          students={students}
        />
      ) : null}

      {activeTab === "students" ? <StudentList students={students} /> : null}

      {activeTab === "attendance" ? (
        <AttendanceMarker
          date={date}
          disabled={saved}
          isHoliday={selectedDateIsHoliday}
          onDateChange={(nextDate) => {
            setDate(nextDate);
            setSaved(false);
            setMessage("");
          }}
          saving={saving}
          statuses={statuses}
          students={students}
          onSave={saveClassAttendance}
          onStatusChange={(studentId, status) => {
            setStatuses((prev) => ({ ...prev, [studentId]: status }));
            setSaved(false);
            setMessage("");
          }}
        />
      ) : null}

      {activeTab === "reports" ? (
        <ReportsPanel assignment={selectedAssignment} session={session} students={students} />
      ) : null}

      {activeTab === "history" ? (
        <StudentHistoryPanel session={session} students={students} />
      ) : null}

      {activeTab === "holidays" ? (
        <HolidayCalendarPanel session={session} />
      ) : null}

      {activeTab === "submitMarks" ? (
        <SubmitMarksPanel
          assignment={selectedAssignment}
          session={session}
          students={students}
        />
      ) : null}

      {activeTab === "viewMarks" ? (
        <ViewMarksPanel
          assignment={selectedAssignment}
          session={session}
        />
      ) : null}

    </ScrollView>
  );
}

function StudentArea({ activeTab, session }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await getStudentAttendance(session.token, session.user.id);
      setDetail(response);
    } catch (err) {
      setError(err.message || "Student data load failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.token, session.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingBlock label="Student dashboard loading..." />;

  const student = detail?.student || session.user;
  const records = detail?.records || [];
  const summary = detail?.summary || summarizeRecords(records);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      {error ? <Notice tone="error" text={error} /> : null}
      {activeTab === "home" ? <StudentHome student={student} summary={summary} /> : null}
      {activeTab === "attendance" ? <StudentAttendance records={records} summary={summary} /> : null}
    </ScrollView>
  );
}

function TeacherHome({ assignment, onOpen, records, students }) {
  const summary = summarizeRecords(records);

  return (
    <View>
      <View style={styles.heroPanel}>
        <View style={styles.heroBrandRow}>
          <View style={styles.heroLogoWrap}>
            <Image source={schoolLogo} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.panelEyebrow}>{SCHOOL_NAME}</Text>
            <Text style={styles.panelSubEyebrow}>Teacher Workspace</Text>
          </View>
        </View>
        <Text style={styles.panelTitle}>
          {assignment ? `Class ${assignment.class} - ${assignment.section}` : "No assignment"}
        </Text>
        <Text style={styles.panelMeta}>
          {assignment?.academic_year || getDefaultAcademicYear()}
        </Text>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard label="Students" value={students.length} tone="teal" />
        <MetricCard label="Present" value={summary.present} tone="green" />
        <MetricCard label="Absent" value={summary.absent} tone="red" />
        <MetricCard label="Late" value={summary.late} tone="amber" />
      </View>

      <View style={styles.featureSection}>
        <Text style={styles.sectionTitle}>Teacher Features</Text>
        <View style={styles.featureGrid}>
          {teacherFeatures.map((feature) => (
            <Pressable
              key={feature.key}
              onPress={() => onOpen(feature.key)}
              style={styles.featureCard}
            >
              <View style={styles.featureIcon}>
                <Text style={styles.featureIconText}>{feature.label.slice(0, 1)}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.featureTitle}>{feature.label}</Text>
                <Text style={styles.featureMeta}>{feature.meta}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function StudentHome({ student, summary }) {
  const workingDays = Number(summary?.workingDays || summary.present + summary.absent + summary.late || 0);
  const percentage = Number(summary?.percentage || (workingDays ? Math.round((summary.present / workingDays) * 100) : 0));

  return (
    <View>
      <View style={styles.heroPanel}>
        <View style={styles.heroBrandRow}>
          <View style={styles.heroLogoWrap}>
            <Image source={schoolLogo} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.panelEyebrow}>{SCHOOL_NAME}</Text>
            <Text style={styles.panelSubEyebrow}>Student Profile</Text>
          </View>
        </View>
        <Text style={styles.panelTitle}>{student?.name || "Student"}</Text>
        <Text style={styles.panelMeta}>
          Class {student?.class || "-"} - {student?.section || "-"} | Roll {student?.roll_no || student?.rollNo || "-"}
        </Text>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard label="Attendance" value={`${percentage}%`} tone="teal" />
        <MetricCard label="Present" value={summary.present || 0} tone="green" />
        <MetricCard label="Absent" value={summary.absent || 0} tone="red" />
        <MetricCard label="Late" value={summary.late || 0} tone="amber" />
      </View>
    </View>
  );
}

function StudentList({ students }) {
  if (!students.length) {
    return <EmptyState title="No students found" text="Assigned class me active students nahi mile." />;
  }

  return (
    <View style={styles.list}>
      {students.map((student) => (
        <View key={student.id} style={styles.rowCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(student.name)}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{student.name || "Student"}</Text>
            <Text style={styles.rowMeta}>
              Roll {student.rollNo || "-"} | {student.class} {student.section}
            </Text>
            {student.mobile ? <Text style={styles.rowSub}>Mobile {student.mobile}</Text> : null}
          </View>
          <View style={student.feeStatus === "paid" ? styles.paidPill : styles.duePill}>
            <Text style={student.feeStatus === "paid" ? styles.paidText : styles.dueText}>
              {student.feeStatus === "paid" ? "Paid" : `Due Rs ${student.previousDue}`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function AttendanceMarker({
  date,
  disabled,
  isHoliday,
  onDateChange,
  onSave,
  onStatusChange,
  saving,
  statuses,
  students,
}) {
  return (
    <View>
      <View style={styles.inlineField}>
        <Text style={styles.inputLabel}>Date</Text>
        <TextInput
          onChangeText={onDateChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#8a8f98"
          style={styles.input}
          value={date}
        />
      </View>

      {isHoliday ? (
        <Notice tone="info" text="Holiday hai. Is date ka attendance record save nahi hoga." />
      ) : null}

      {students.length ? (
        students.map((student) => (
          <View key={student.id} style={styles.attendanceCard}>
            <View style={styles.attendanceHeader}>
              <View>
                <Text style={styles.rowTitle}>{student.name || "Student"}</Text>
                <Text style={styles.rowMeta}>Roll {student.rollNo || "-"}</Text>
              </View>
            </View>
            {isHoliday ? (
              <View style={styles.holidayPill}>
                <Text style={styles.holidayPillText}>No attendance on holiday</Text>
              </View>
            ) : (
              <View style={styles.statusRow}>
                {statusOptions.map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => onStatusChange(student.id, option.key)}
                    style={[
                      styles.statusButton,
                      statuses[student.id] === option.key && styles.statusButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        statuses[student.id] === option.key && styles.statusTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))
      ) : (
        <EmptyState title="No students" text="Attendance mark karne ke liye students load nahi hue." />
      )}

      <Pressable
        disabled={saving || disabled || !students.length || isHoliday}
        onPress={onSave}
        style={[
          styles.primaryButton,
          (saving || disabled || !students.length || isHoliday) && styles.disabledButton,
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {isHoliday ? "Holiday - No Attendance" : disabled ? "Attendance Saved" : "Save Attendance"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function SubmitMarksPanel({ assignment, session, students }) {
  const [terminal, setTerminal] = useState("First");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!students.length) return;
    const selected = students.find((student) => student.id === selectedStudentId) || students[0];
    setSelectedStudentId(selected.id);
    setRollNo(String(selected.rollNo || ""));
  }, [students, selectedStudentId]);

  const loadSubjects = useCallback(async () => {
    if (!assignment) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      let response = await getSubjectsForClass(session.token, assignment.class, assignment.section);
      let normalized = normalizeClassSubjects(response);
      if (!normalized.length && assignment.section) {
        response = await getSubjectsForClass(session.token, assignment.class);
        normalized = normalizeClassSubjects(response);
      }
      setSubjects(normalized);
      setMarks(
        normalized.map((subject) => ({
          subject_name: subject.name,
          subject_code: subject.code,
          external_marks: "",
          internal_marks: "",
        })),
      );
    } catch (err) {
      setSubjects([]);
      setMarks([]);
      setError(err.message || "Subjects load failed");
    } finally {
      setLoading(false);
    }
  }, [assignment, session.token]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const updateMark = (index, field, value) => {
    const subject = subjects[index];
    const rules = getSubjectRules(subject?.name);
    const cleanValue = String(value || "").replace(/[^\d]/g, "");
    const numericValue = cleanValue === "" ? "" : Number(cleanValue);

    if (field === "internal_marks" && !rules.internalAllowed) return;
    if (numericValue !== "" && numericValue > (field === "external_marks" ? rules.externalMax : rules.internalMax)) {
      setError(`${subject?.name || "Subject"} max ${field === "external_marks" ? rules.externalMax : rules.internalMax} marks allowed hai.`);
      return;
    }

    setError("");
    setMarks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: numericValue };
      return next;
    });
  };

  const saveMarks = async () => {
    if (!assignment) {
      setError("Class assignment nahi mila.");
      return;
    }

    const parsedRollNo = Number(rollNo);
    if (!terminal || !parsedRollNo || parsedRollNo < 1) {
      setError("Terminal aur valid roll number required hai.");
      return;
    }

    const marksPayload = marks
      .map((mark, index) => {
        const subject = subjects[index];
        const rules = getSubjectRules(subject?.name);
        const external = Number(mark.external_marks || 0);
        const internal = rules.internalAllowed ? Number(mark.internal_marks || 0) : 0;
        return {
          subject_name: subject?.name || mark.subject_name,
          subject_code: subject?.code || mark.subject_code,
          external_marks: external,
          ...(rules.internalAllowed ? { internal_marks: internal } : {}),
        };
      })
      .filter((mark) => Number(mark.external_marks || 0) > 0 || Number(mark.internal_marks || 0) > 0);

    if (!marksPayload.length) {
      setError("Kam se kam ek subject ke marks enter karein.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await submitMarks(session.token, {
        ...assignmentParams(assignment),
        terminal,
        roll_no: parsedRollNo,
        marks: marksPayload,
      });
      setMessage(response?.message || "Marks submitted successfully.");
    } catch (err) {
      setError(err.message || "Marks submit failed");
    } finally {
      setSaving(false);
    }
  };

  if (!assignment) {
    return <EmptyState title="No assignment" text="Marks submit karne ke liye teacher class assignment required hai." />;
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Submit Marks</Text>
      <TerminalSelector value={terminal} onChange={setTerminal} />

      <StudentPicker
        selectedStudentId={selectedStudentId}
        students={students}
        onSelect={(student) => {
          setSelectedStudentId(student.id);
          setRollNo(String(student.rollNo || ""));
        }}
      />

      <View style={styles.inlineField}>
        <Text style={styles.inputLabel}>Roll No</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={setRollNo}
          placeholder="Roll number"
          placeholderTextColor="#8a8f98"
          style={styles.input}
          value={rollNo}
        />
      </View>

      {error ? <Notice tone="error" text={error} /> : null}
      {message ? <Notice tone="info" text={message} /> : null}
      {loading ? <LoadingBlock label="Subjects loading..." /> : null}

      {!loading && subjects.length ? (
        subjects.map((subject, index) => {
          const rules = getSubjectRules(subject.name);
          return (
            <View key={subject.id || subject.name} style={styles.marksCard}>
              <View style={styles.marksHeader}>
                <View>
                  <Text style={styles.rowTitle}>{subject.name}</Text>
                  <Text style={styles.rowMeta}>
                    {subject.code || "Subject"} | External max {rules.externalMax}
                    {rules.internalAllowed ? ` | Internal max ${rules.internalMax}` : " | No internal"}
                  </Text>
                </View>
              </View>
              <View style={styles.marksInputRow}>
                <View style={styles.marksInputWrap}>
                  <Text style={styles.miniLabel}>External</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => updateMark(index, "external_marks", value)}
                    placeholder="0"
                    placeholderTextColor="#8a8f98"
                    style={styles.input}
                    value={String(marks[index]?.external_marks ?? "")}
                  />
                </View>
                {rules.internalAllowed ? (
                  <View style={styles.marksInputWrap}>
                    <Text style={styles.miniLabel}>Internal</Text>
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => updateMark(index, "internal_marks", value)}
                      placeholder="0"
                      placeholderTextColor="#8a8f98"
                      style={styles.input}
                      value={String(marks[index]?.internal_marks ?? "")}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      ) : null}

      {!loading && !subjects.length ? (
        <EmptyState title="No subjects" text="Selected class/section ke subjects backend me nahi mile." />
      ) : null}

      <Pressable disabled={saving || loading || !subjects.length} onPress={saveMarks} style={[styles.primaryButton, (saving || loading || !subjects.length) && styles.disabledButton]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Submit Marks</Text>}
      </Pressable>
    </View>
  );
}

function ViewMarksPanel({ assignment, session }) {
  const [terminal, setTerminal] = useState("First");
  const [marksData, setMarksData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMarks = useCallback(async () => {
    if (!assignment) return;
    setLoading(true);
    setError("");
    try {
      const response = await getMarks(session.token, {
        class: assignment.class,
        section: assignment.section,
        terminal,
      });
      setMarksData(response);
    } catch (err) {
      setMarksData(null);
      setError(err.message || "Marks load failed");
    } finally {
      setLoading(false);
    }
  }, [assignment, session.token, terminal]);

  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  if (!assignment) {
    return <EmptyState title="No assignment" text="Marks view karne ke liye teacher class assignment required hai." />;
  }

  const rows = marksData?.students || [];
  const submittedCount = rows.reduce(
    (count, student) => count + (student.marks || []).filter((mark) => mark.status === "SUBMITTED" || mark.status === "LOCKED").length,
    0,
  );
  const pendingCount = rows.reduce(
    (count, student) => count + (student.marks || []).filter((mark) => mark.status === "PENDING").length,
    0,
  );

  return (
    <View>
      <Text style={styles.sectionTitle}>View Marks</Text>
      <TerminalSelector value={terminal} onChange={setTerminal} />
      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label="Marks loading..." /> : null}

      {!loading && rows.length ? (
        <View>
          <View style={styles.metricGrid}>
            <MetricCard label="Students" value={rows.length} tone="teal" />
            <MetricCard label="Submitted" value={submittedCount} tone="green" />
            <MetricCard label="Pending" value={pendingCount} tone="amber" />
          </View>

          <View style={[styles.list, styles.topGap]}>
            {rows.map((student) => (
              <View key={student.student_id} style={styles.marksStudentCard}>
                <View style={styles.recordRowHeader}>
                  <View>
                    <Text style={styles.rowTitle}>{student.name}</Text>
                    <Text style={styles.rowMeta}>Roll {student.roll_no} | Class {student.class} {student.section}</Text>
                  </View>
                  <Text style={styles.totalText}>Total {getStudentMarksTotal(student.marks)}</Text>
                </View>
                {(student.marks || []).map((mark) => (
                  <View key={mark.subject_id} style={styles.markLine}>
                    <View style={styles.rowBody}>
                      <Text style={styles.markSubject}>{mark.subject_name}</Text>
                      <Text style={styles.rowMeta}>
                        Ext {mark.external_marks ?? 0} | Int {mark.internal_marks ?? 0}
                      </Text>
                    </View>
                    <StatusPill status={mark.status} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!loading && !rows.length ? (
        <EmptyState title="No marks found" text="Selected terminal ke liye marks records nahi mile." />
      ) : null}
    </View>
  );
}

function ReportsPanel({ assignment, session, students }) {
  const [month, setMonth] = useState(monthIso());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const summary = summarizeRecords(records);
  const workingDays = summary.present + summary.absent + summary.late;
  const percentage = workingDays ? Math.round(((summary.present + summary.late) / workingDays) * 100) : 0;

  useEffect(() => {
    const loadReports = async () => {
      if (!assignment) {
        setRecords([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await getAttendanceRecords(session.token, {
          ...assignmentParams(assignment),
          month,
        });
        setRecords(response?.records || []);
      } catch (err) {
        setRecords([]);
        setError(err.message || "Reports load failed");
      } finally {
        setLoading(false);
      }
    };
    loadReports();
  }, [assignment, month, session.token]);

  if (!assignment) {
    return <EmptyState title="No assignment" text="Reports dekhne ke liye teacher class assignment required hai." />;
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Monthly Reports</Text>
      <View style={styles.inlineField}>
        <Text style={styles.inputLabel}>Month</Text>
        <TextInput
          onChangeText={setMonth}
          placeholder="YYYY-MM"
          placeholderTextColor="#8a8f98"
          style={styles.input}
          value={month}
        />
      </View>
      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label="Reports loading..." /> : null}
      <View style={styles.metricGrid}>
        <MetricCard label="Present" value={summary.present} tone="green" />
        <MetricCard label="Absent" value={summary.absent} tone="red" />
        <MetricCard label="Late" value={summary.late} tone="amber" />
        <MetricCard label="Attendance" value={`${percentage}%`} tone="teal" />
      </View>
      <View style={styles.topGap} />
      {!loading ? <RecordList records={records} studentMap={studentMap} /> : null}
    </View>
  );
}

function StudentHistoryPanel({ session, students }) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!students.length) {
      setSelectedStudentId("");
      setDetail(null);
      return;
    }
    setSelectedStudentId((current) =>
      students.some((student) => student.id === current) ? current : students[0].id,
    );
  }, [students]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedStudentId) return;
      setLoading(true);
      setError("");
      try {
        setDetail(await getStudentAttendance(session.token, selectedStudentId));
      } catch (err) {
        setDetail(null);
        setError(err.message || "Student attendance load failed");
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [selectedStudentId, session.token]);

  const summary = detail?.summary || summarizeRecords(detail?.records || []);
  const workingDays = Number(summary?.workingDays || summary.present + summary.absent + summary.late || 0);
  const percentage = Number(summary?.percentage || (workingDays ? Math.round((summary.present / workingDays) * 100) : 0));

  return (
    <View>
      <Text style={styles.sectionTitle}>Student History</Text>
      {students.length ? (
        <StudentPicker
          selectedStudentId={selectedStudentId}
          students={students}
          onSelect={(student) => setSelectedStudentId(student.id)}
        />
      ) : null}
      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label="Student history loading..." /> : null}
      {!loading && detail ? (
        <View>
          <View style={styles.metricGrid}>
            <MetricCard label="Present" value={summary.present || 0} tone="green" />
            <MetricCard label="Absent" value={summary.absent || 0} tone="red" />
            <MetricCard label="Late" value={summary.late || 0} tone="amber" />
            <MetricCard label="Attendance" value={`${percentage}%`} tone="teal" />
          </View>
          <View style={styles.topGap}>
            <RecordList records={detail.records || []} />
          </View>
        </View>
      ) : null}
      {!loading && !students.length ? (
        <EmptyState title="No students" text="Student history ke liye assigned class me students nahi mile." />
      ) : null}
    </View>
  );
}

function HolidayCalendarPanel({ session }) {
  const [month, setMonth] = useState(monthIso());
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHolidays = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getHolidayCalendar(session.token, { month });
        setHolidays(response?.holidays || []);
      } catch (err) {
        setHolidays([]);
        setError(err.message || "Holiday calendar load failed");
      } finally {
        setLoading(false);
      }
    };
    loadHolidays();
  }, [month, session.token]);

  return (
    <View>
      <Text style={styles.sectionTitle}>Holiday Calendar</Text>
      <View style={styles.inlineField}>
        <Text style={styles.inputLabel}>Month</Text>
        <TextInput
          onChangeText={setMonth}
          placeholder="YYYY-MM"
          placeholderTextColor="#8a8f98"
          style={styles.input}
          value={month}
        />
      </View>
      <Notice tone="info" text="Friday holidays automatic hain. Teacher account se holidays view-only hain." />
      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label="Holidays loading..." /> : null}
      {!loading && holidays.length ? (
        <View style={styles.list}>
          {holidays.map((holiday) => {
            const startDate = holiday.start_date || holiday.holiday_date;
            const endDate = holiday.end_date || holiday.holiday_date;
            const dateText = startDate === endDate ? formatDisplayDate(startDate) : `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
            return (
              <View key={holiday.id || `${startDate}-${holiday.title}`} style={styles.holidayCard}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{holiday.title || "Holiday"}</Text>
                  <Text style={styles.rowMeta}>{dateText}</Text>
                  {holiday.description ? <Text style={styles.rowSub}>{holiday.description}</Text> : null}
                </View>
                <View style={styles.holidayTypePill}>
                  <Text style={styles.holidayTypeText}>{holiday.type === "weekly" ? "Friday" : "Admin"}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {!loading && !holidays.length ? (
        <EmptyState title="No holidays" text="Selected month me holiday records nahi mile." />
      ) : null}
    </View>
  );
}

function StudentAttendance({ records, summary }) {
  return (
    <View>
      <View style={styles.metricGrid}>
        <MetricCard label="Present" value={summary.present || 0} tone="green" />
        <MetricCard label="Absent" value={summary.absent || 0} tone="red" />
      </View>
      <RecordList records={records} />
    </View>
  );
}

function RecordList({ records, studentMap }) {
  if (!records.length) {
    return <EmptyState title="No attendance records" text="Is filter ke liye attendance records nahi mile." />;
  }

  return (
    <View style={styles.list}>
      {records.map((record) => {
        const student = studentMap?.get(record.student_id);
        return (
          <View key={record.id || `${record.student_id}-${record.attendance_date}`} style={styles.recordRow}>
            <View>
              <Text style={styles.rowTitle}>{student?.name || formatDisplayDate(record.attendance_date)}</Text>
              <Text style={styles.rowMeta}>
                {student ? formatDisplayDate(record.attendance_date) : `Class ${record.class || "-"} ${record.section || ""}`}
              </Text>
            </View>
            <StatusPill status={record.status} />
          </View>
        );
      })}
    </View>
  );
}

function TerminalSelector({ value, onChange }) {
  return (
    <View style={styles.terminalRow}>
      {terminals.map((terminal) => (
        <Pressable
          key={terminal}
          onPress={() => onChange(terminal)}
          style={[styles.terminalButton, value === terminal && styles.terminalButtonActive]}
        >
          <Text style={[styles.terminalText, value === terminal && styles.terminalTextActive]}>{terminal}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function StudentPicker({ selectedStudentId, students, onSelect }) {
  if (!students.length) {
    return <EmptyState title="No students" text="Marks submit karne ke liye students load nahi hue." />;
  }

  return (
    <View style={styles.inlineField}>
      <Text style={styles.inputLabel}>Student</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {students.map((student) => {
          const active = selectedStudentId === student.id;
          return (
            <Pressable
              key={student.id}
              onPress={() => onSelect(student)}
              style={[styles.studentChip, active && styles.studentChipActive]}
            >
              <Text style={[styles.studentChipTitle, active && styles.studentChipTextActive]}>
                {student.name || "Student"}
              </Text>
              <Text style={[styles.studentChipMeta, active && styles.studentChipTextActive]}>
                Roll {student.rollNo || "-"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AssignmentPicker({ assignments, selectedKey, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignmentScroller}>
      {assignments.map((assignment) => {
        const key = assignmentKey(assignment);
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            style={[styles.assignmentChip, selectedKey === key && styles.assignmentChipActive]}
          >
            <Text style={[styles.assignmentText, selectedKey === key && styles.assignmentTextActive]}>
              {assignment.class} {assignment.section}
            </Text>
            <Text style={[styles.assignmentYear, selectedKey === key && styles.assignmentTextActive]}>
              {assignment.academic_year}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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

function StatusPill({ status }) {
  const normalized = String(status || "present").toLowerCase();
  return (
    <View style={[styles.statusPill, styles[`pill_${normalized}`] || styles.pill_present]}>
      <Text style={styles.statusPillText}>{status || "-"}</Text>
    </View>
  );
}

function SegmentButton({ active, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Notice({ tone, text }) {
  const toneStyle = tone === "error" ? styles.noticeError : tone === "success" ? styles.noticeSuccess : styles.noticeInfo;

  return (
    <View style={[styles.notice, toneStyle]}>
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

const assignmentKey = (assignment) =>
  assignment ? `${assignment.class}|${assignment.section}|${assignment.academic_year}` : "";

const assignmentParams = (assignment) => ({
  class: assignment?.class || "",
  section: assignment?.section || "",
  academic_year: assignment?.academic_year || getDefaultAcademicYear(),
});

const normalizeClassSubjects = (response) => {
  const rows = response?.subjects || [];
  return rows
    .map((item, index) => {
      const subject = item.subject || item.subjects || item;
      return {
        id: subject?.id || item.subject_id || item.id || `${subject?.name || "subject"}-${index}`,
        name: subject?.name || item.subject_name || item.name || "",
        code: subject?.code || item.subject_code || item.code || "",
      };
    })
    .filter((subject) => subject.name);
};

const getSubjectRules = (subjectName = "") => {
  const isDrawing = String(subjectName).toLowerCase().includes("drawing");
  return {
    externalMax: isDrawing ? 50 : 80,
    internalMax: isDrawing ? 0 : 20,
    internalAllowed: !isDrawing,
  };
};

const getStudentMarksTotal = (marks = []) =>
  (marks || []).reduce(
    (sum, mark) => sum + Number(mark.external_marks || 0) + Number(mark.internal_marks || 0),
    0,
  );

const getInitials = (name = "") =>
  String(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f1e7",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  centerScreen: {
    alignItems: "center",
    backgroundColor: "#f6f1e7",
    flex: 1,
    justifyContent: "center",
  },
  openingBrandCard: {
    alignItems: "center",
    marginBottom: 28,
    paddingHorizontal: 24,
  },
  openingLogo: {
    height: 176,
    marginBottom: 12,
    width: 176,
  },
  openingTitle: {
    color: "#152238",
    fontSize: 25,
    fontWeight: "900",
    textAlign: "center",
  },
  openingSubtitle: {
    color: "#94733b",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5,
    textTransform: "uppercase",
  },
  loginShell: {
    flex: 1,
    backgroundColor: "#f6f1e7",
  },
  loginContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingBottom: 44,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  logoHalo: {
    alignItems: "center",
    backgroundColor: "#fff8e8",
    borderColor: "#e4c27a",
    borderRadius: 8,
    borderWidth: 1,
    height: 118,
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#8d6a27",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    width: 118,
    elevation: 5,
  },
  logoMark: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderColor: "#eadfbf",
    borderWidth: 1,
    height: 102,
    justifyContent: "center",
    width: 102,
  },
  logoImage: {
    height: 96,
    width: 96,
  },
  brandKicker: {
    color: "#0f5f63",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  brandTitle: {
    color: "#152238",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  brandSubtitle: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  brandPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "center",
    marginTop: 14,
  },
  brandPill: {
    backgroundColor: "#fff",
    borderColor: "#eadfbf",
    borderRadius: 8,
    borderWidth: 1,
    color: "#7b5d25",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segment: {
    backgroundColor: "#e8edf0",
    borderColor: "#d8c9a3",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 18,
    padding: 5,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#fffaf0",
  },
  segmentText: {
    color: "#52606d",
    fontSize: 14,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: "#0f5f63",
  },
  formBlock: {
    backgroundColor: "#fff",
    borderColor: "#e0d4bd",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#152238",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  inputLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 10,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#fbfcfd",
    borderColor: "#d4d9df",
    borderRadius: 8,
    borderWidth: 1,
    color: "#17202a",
    fontSize: 15,
    fontWeight: "700",
    minHeight: 48,
    paddingHorizontal: 13,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f5f63",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 50,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  errorText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 12,
  },
  appShell: {
    flex: 1,
    backgroundColor: "#f6f1e7",
  },
  header: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomColor: "#dfcfac",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerBrandRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  headerLogo: {
    height: 44,
    width: 44,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerSchool: {
    color: "#0f5f63",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  roleBadge: {
    backgroundColor: "#fff8e8",
    borderColor: "#e4c27a",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  roleBadgeText: {
    color: "#7b5d25",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  headerTitle: {
    color: "#152238",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  logoutButton: {
    borderColor: "#b8c7ca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  logoutText: {
    color: "#0f5f63",
    fontSize: 12,
    fontWeight: "900",
  },
  content: {
    padding: 16,
    paddingBottom: 98,
  },
  tabScroller: {
    backgroundColor: "#fff",
    borderTopColor: "#dfcfac",
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  tabBar: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minWidth: 86,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  tabButtonActive: {
    backgroundColor: "#0f5f63",
  },
  tabText: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900",
  },
  tabTextActive: {
    color: "#fff",
  },
  loadingBlock: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },
  heroPanel: {
    backgroundColor: "#152238",
    borderRadius: 8,
    marginBottom: 14,
    padding: 18,
    shadowColor: "#152238",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  heroBrandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  heroLogoWrap: {
    alignItems: "center",
    backgroundColor: "#fff8e8",
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroLogo: {
    height: 42,
    width: 42,
  },
  panelEyebrow: {
    color: "#f6cf73",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  panelSubEyebrow: {
    color: "#cfe8e8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 14,
  },
  panelMeta: {
    color: "#d6dde5",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    borderRadius: 8,
    minHeight: 86,
    padding: 14,
    width: "48%",
  },
  metric_teal: {
    backgroundColor: "#d7f4f0",
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
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#17202a",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 8,
  },
  featureSection: {
    marginTop: 18,
  },
  featureGrid: {
    gap: 10,
  },
  featureCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 12,
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: "#e7edf0",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  featureIconText: {
    color: "#126a6f",
    fontSize: 16,
    fontWeight: "900",
  },
  featureTitle: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "900",
  },
  featureMeta: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  assignmentScroller: {
    marginBottom: 14,
  },
  assignmentChip: {
    backgroundColor: "#fff",
    borderColor: "#d4d9df",
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assignmentChipActive: {
    backgroundColor: "#126a6f",
    borderColor: "#126a6f",
  },
  assignmentText: {
    color: "#17202a",
    fontSize: 13,
    fontWeight: "900",
  },
  assignmentYear: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  assignmentTextActive: {
    color: "#fff",
  },
  list: {
    gap: 10,
  },
  topGap: {
    marginTop: 12,
  },
  rowCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#334155",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
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
  duePill: {
    backgroundColor: "#fff7ed",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dueText: {
    color: "#9a3412",
    fontSize: 11,
    fontWeight: "900",
  },
  paidPill: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paidText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "900",
  },
  holidayCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  holidayPill: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  holidayPillText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
  },
  holidayTypePill: {
    backgroundColor: "#eef6ff",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  holidayTypeText: {
    color: "#1e3a5f",
    fontSize: 11,
    fontWeight: "900",
  },
  inlineField: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#17202a",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 10,
  },
  terminalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  terminalButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d4d9df",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    minWidth: 78,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  terminalButtonActive: {
    backgroundColor: "#126a6f",
    borderColor: "#126a6f",
  },
  terminalText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
  },
  terminalTextActive: {
    color: "#fff",
  },
  studentChip: {
    backgroundColor: "#fff",
    borderColor: "#d4d9df",
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 136,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  studentChipActive: {
    backgroundColor: "#17202a",
    borderColor: "#17202a",
  },
  studentChipTitle: {
    color: "#17202a",
    fontSize: 13,
    fontWeight: "900",
  },
  studentChipMeta: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  studentChipTextActive: {
    color: "#fff",
  },
  attendanceCard: {
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  attendanceHeader: {
    marginBottom: 10,
  },
  marksCard: {
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  marksHeader: {
    marginBottom: 10,
  },
  marksInputRow: {
    flexDirection: "row",
    gap: 10,
  },
  marksInputWrap: {
    flex: 1,
  },
  miniLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  marksStudentCard: {
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  recordRowHeader: {
    alignItems: "flex-start",
    borderBottomColor: "#edf0f3",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
    paddingBottom: 8,
  },
  totalText: {
    color: "#126a6f",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  markLine: {
    alignItems: "center",
    borderBottomColor: "#f1f3f5",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 46,
    paddingVertical: 6,
  },
  markSubject: {
    color: "#17202a",
    fontSize: 13,
    fontWeight: "900",
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
  },
  statusButton: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  statusButtonActive: {
    backgroundColor: "#126a6f",
  },
  statusText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
  },
  statusTextActive: {
    color: "#fff",
  },
  recordRow: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  statusPill: {
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pill_present: {
    backgroundColor: "#dcfce7",
  },
  pill_absent: {
    backgroundColor: "#fee2e2",
  },
  pill_late: {
    backgroundColor: "#fef3c7",
  },
  pill_submitted: {
    backgroundColor: "#dcfce7",
  },
  pill_locked: {
    backgroundColor: "#dbeafe",
  },
  pill_pending: {
    backgroundColor: "#fef3c7",
  },
  statusPillText: {
    color: "#17202a",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "capitalize",
  },
  notice: {
    borderRadius: 8,
    marginBottom: 12,
    padding: 12,
  },
  noticeError: {
    backgroundColor: "#fee2e2",
  },
  noticeInfo: {
    backgroundColor: "#d7f4f0",
  },
  noticeSuccess: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderWidth: 1,
  },
  noticeText: {
    color: "#17202a",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e4ded2",
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  emptyTitle: {
    color: "#17202a",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
});
