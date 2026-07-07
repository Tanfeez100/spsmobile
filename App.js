import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import {
  getAttendanceBootstrap,
  getAttendanceRecords,
  getHolidayCalendar,
  getMarks,
  getTeacherAttendanceRecords,
  getTeacherAttendanceToday,
  getTeacherLeaves,
  getStudentAttendance,
  getStudentLeaveRequestsAdmin,
  getStudents,
  getSubjectsForClass,
  loginStudent,
  loginTeacher,
  registerAuthRefreshHandler,
  registerStudentPushToken,
  refreshTeacherToken,
  setStudentPassword,
  saveAttendance,
  reviewStudentLeaveRequest,
  submitCheckoutExplanation,
  submitMarks,
  submitTeacherLeave,
  teacherCheckIn,
  teacherCheckOut,
} from "./src/api/client";
import StudentLeavePanel from "./src/components/student/StudentLeavePanel";
import StudentFeeDashboardPanel from "./src/components/student/StudentFeeDashboardPanel";
import StudentNotificationsPanel from "./src/components/student/StudentNotificationsPanel";
import StudentResultsPanel from "./src/components/student/StudentResultsPanel";
import {
  clearSavedLogin,
  clearSession,
  loadSavedLogin,
  loadSession,
  saveSavedLogin,
  saveSession,
} from "./src/storage/session";
import { formatDisplayDate, getDefaultAcademicYear, monthIso, todayIso } from "./src/utils/date";

const schoolLogo = require("./src/assets/logo.png");
const schoolCelebration = require("./src/assets/celeb.jpeg");
const iconStudents = require("./src/assets/studentsicon.png");
const iconCheckout = require("./src/assets/checkouticon.png");
const iconAttendance = require("./src/assets/icons8-attendance-50.png");
const iconHome = require("./src/assets/icons8-home-50.png");
const iconReportCard = require("./src/assets/icons8-report-card-50.png");
const iconReports = require("./src/assets/icons8-reports-50.png");
const iconHistory = require("./src/assets/icons8-history-50.png");
const iconView = require("./src/assets/icons8-view-80.png");
const bookIllustration = require("./src/assets/bookimage.png");
const SCHOOL_NAME = "Star Public School";
const SCHOOL_SHORT_NAME = "SPS";
const SCHOOL_TAGLINE = "Learning, discipline and daily progress";
const SCHOOL_PHONE = "+91 9006457330";
const SCHOOL_EMAIL = "a9006457330@gmail.com";
const SCHOOL_ADDRESS = "Meghwal mathia Bazar, West Champaran, Bihar 845106";
const SCHOOL_SUPPORT_HOURS = "Monday to Saturday, 8:00 AM to 2:00 PM";

const privacyPolicyPoints = [
  "We collect only information required for admission, attendance, fees, examination, communication and school administration.",
  "For teachers, GPS attendance is used only for daily check-in and check-out.",
  "Student and teacher data is used to run the school ERP and to communicate important school updates.",
  "Passwords, authentication tokens and school records are stored securely and accessed only by authorized staff.",
  "Data is retained for as long as needed for school operations, statutory records and legitimate administrative purposes.",
  "Users may request correction or deletion of information through the school office, subject to school and legal record requirements.",
];

const termsPoints = [
  "The app is for school-related use only.",
  "Users must keep their login details secure and must not share accounts with others.",
  "The school owns the application content, records and configuration shown inside the app.",
  "Users must not misuse the app, attempt unauthorized access, or interfere with school systems.",
  "The school may suspend access if misuse, fraud or security risk is detected.",
  "The app is provided to support school operations and the school is not liable for issues caused by misuse, device problems or network outages.",
];

const statusOptions = [
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "late", label: "Late" },
];

const statusLabels = {
  present_provisional: "Present Provisional",
  present: "Present",
  late: "Late",
  half_day: "Half Day",
  absent: "Absent",
  leave: "Leave",
  holiday: "Holiday",
  checkout_missing: "Checkout Missing",
  rejected: "Rejected",
  pending: "Pending",
  approved: "Approved",
};

const getCurrentYear = () => String(new Date().getFullYear());
const formatMonthLabel = (monthKey) => {
  if (!monthKey) return "-";
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(parsed);
};

const buildRecentMonthOptions = (count = 12) => {
  const options = [];
  const now = new Date();

  for (let index = 0; index < count; index += 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const value = monthDate.toISOString().slice(0, 7);
    options.push({ value, label: formatMonthLabel(value) });
  }

  return options;
};

const formatProfileDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getStudentDisplayName = (student) => student?.name || student?.full_name || "Student";

const getProfilePhotoSource = (user) => {
  const photoUrl =
    user?.photo_url ||
    user?.photoUrl ||
    user?.profile_photo ||
    user?.profilePhoto ||
    user?.avatar_url ||
    user?.avatarUrl ||
    user?.image_url ||
    user?.imageUrl ||
    user?.photo ||
    user?.avatar;

  if (photoUrl) {
    return { uri: photoUrl };
  }

  return schoolCelebration;
};

const summarizeTeacherHistory = (records = []) =>
  records.reduce(
    (summary, record) => {
      const status = String(record?.status || "").toLowerCase();

      summary.total_records += 1;
      if (["present", "late", "half_day", "present_provisional"].includes(status)) summary.working_days += 1;
      if (status === "present" || status === "present_provisional") summary.present += 1;
      if (status === "late") summary.late += 1;
      if (status === "half_day") summary.half_day += 1;
      if (status === "absent") summary.absent += 1;
      if (status === "leave") summary.leave += 1;
      if (status === "checkout_missing") summary.checkout_missing += 1;

      return summary;
    },
    {
      total_records: 0,
      working_days: 0,
      present: 0,
      late: 0,
      half_day: 0,
      absent: 0,
      leave: 0,
      checkout_missing: 0,
    },
  );

const checkoutReasonOptions = [
  { value: "Forgot Checkout", label: "Forgot check-out" },
  { value: "Location Problem", label: "Location issue" },
  { value: "Network Issue", label: "Network issue" },
  { value: "Emergency", label: "Emergency" },
  { value: "Other", label: "Other" },
];

const leaveTypeOptions = [
  "Casual Leave",
  "Sick Leave",
  "Emergency Leave",
  "Duty Leave",
];

const teacherTabSections = [
  {
    key: "home",
    title: "Home",
    subtitle: "Overview",
    tabs: [{ key: "home", label: "Home" }],
  },
  {
    key: "attendance",
    title: "Attendance",
    subtitle: "Daily tracking",
    tabs: [
      { key: "gpsAttendance", label: "Check In/Out" },
      { key: "attendance", label: "Add Attendance" },
      { key: "students", label: "Students" },
      { key: "holidays", label: "Holidays" },
    ],
  },
  {
    key: "marks",
    title: "Marks",
    subtitle: "Assessments",
    tabs: [
      { key: "submitMarks", label: "Submit Marks" },
      { key: "viewMarks", label: "View Marks" },
    ],
  },
  {
    key: "reportsHistory",
    title: "Reports",
    subtitle: "Analytics",
    tabs: [
      { key: "gpsHistory", label: "My History" },
      { key: "history", label: "History" },
      { key: "reports", label: "Reports" },
    ],
  },
];

const teacherFeatures = [
  { key: "gpsAttendance", label: "Check In/Out", meta: "Mark arrival, departure and leave" },
  { key: "gpsHistory", label: "My History", meta: "Monthly and yearly attendance history" },
  { key: "attendance", label: "Add Attendance", meta: "Mark class attendance" },
  { key: "reports", label: "Reports", meta: "Monthly class report" },
  { key: "history", label: "Student History", meta: "Student attendance record" },
  { key: "holidays", label: "Holidays", meta: "School holiday calendar" },
  { key: "submitMarks", label: "Submit Marks", meta: "Enter terminal marks" },
  { key: "viewMarks", label: "View Marks", meta: "Review submitted marks" },
];

const terminals = ["First", "Second", "Third", "Annual"];

const studentTabSections = [
  {
    key: "home",
    title: "Home",
    subtitle: "Overview",
    tabs: [{ key: "home", label: "Home" }],
  },
  {
    key: "attendance",
    title: "Attendance",
    subtitle: "Daily record",
    tabs: [
      { key: "attendance", label: "Attendance" },
      { key: "leave", label: "Leave Apply" },
      { key: "holidays", label: "Holidays" },
    ],
  },
  {
    key: "fees",
    title: "Fee",
    subtitle: "Dashboard",
    tabs: [{ key: "fees", label: "Fee" }],
  },
  {
    key: "results",
    title: "Results",
    subtitle: "Published reports",
    tabs: [{ key: "results", label: "Results" }],
  },
];

const getActiveTabSection = (sections, tabKey) =>
  sections.find((section) => section.tabs.some((tab) => tab.key === tabKey)) || sections[0] || null;

const getSectionIcon = (sectionKey) =>
  ({
    home: iconHome,
    attendance: iconAttendance,
    marks: iconReportCard,
    reportsHistory: iconReports,
    fees: iconReportCard,
    results: iconView,
  }[sectionKey] || iconHome);

const getTeacherFeatureIcon = (featureKey) =>
  ({
    gpsAttendance: iconCheckout,
    gpsHistory: iconHistory,
    attendance: iconAttendance,
    reports: iconReports,
    history: iconHistory,
    holidays: iconAttendance,
    submitMarks: iconReportCard,
    viewMarks: iconView,
  }[featureKey] || iconAttendance);

const getAccessToken = (data) => data?.access_token || data?.session?.access_token || "";
const getRefreshToken = (data) => data?.session?.refresh_token || data?.refresh_token || "";
const getMustResetPassword = (data) =>
  Boolean(data?.must_reset_password || data?.user?.mustResetPassword || data?.user?.must_reset_password);
const getTokenExpiresAt = (data) => {
  const tokenInfoExpiresAt = data?.token_info?.expires_at;
  if (tokenInfoExpiresAt) return tokenInfoExpiresAt;

  const sessionExpiresAt = data?.session?.expires_at;
  if (typeof sessionExpiresAt === "number") {
    return new Date(sessionExpiresAt * 1000).toISOString();
  }

  const expiresIn = data?.token_info?.expires_in || data?.session?.expires_in || data?.expires_in;
  if (Number.isFinite(Number(expiresIn))) {
    return new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
  }

  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
};

const getExpoProjectId = () =>
  Constants?.expoConfig?.extra?.eas?.projectId ||
  Constants?.easConfig?.projectId ||
  Constants?.expoConfig?.extra?.projectId ||
  null;

const registerStudentDeviceToken = async (session) => {
  if (Platform.OS === "web" || session?.role !== "student" || !session?.token) {
    return;
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let status = existingPermissions?.status;

  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested?.status;
  }

  if (status !== "granted") {
    return;
  }

  const projectId = getExpoProjectId();
  const pushTokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  const pushToken = pushTokenResponse?.data || pushTokenResponse?.token || "";
  if (!pushToken) {
    return;
  }

  await registerStudentPushToken(session.token, {
    push_token: pushToken,
    platform: Platform.OS,
    device_id: `${Platform.OS}-${session.user?.id || "student"}`,
  });
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
  const [legalView, setLegalView] = useState(null);
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

  if (legalView) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ExpoStatusBar style="dark" />
        <LegalScreen
          type={legalView}
          onBack={() => setLegalView(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      {session?.role === "student" && session.mustResetPassword ? (
        <StudentPasswordSetup session={session} onComplete={handleSession} onLogout={handleLogout} />
      ) : session ? (
        <Dashboard
          session={session}
          onLogout={handleLogout}
          onOpenPrivacy={() => setLegalView("privacy")}
          onOpenTerms={() => setLegalView("terms")}
          onOpenContact={() => setLegalView("contact")}
        />
      ) : (
        <LoginScreen
          onLogin={handleSession}
          onOpenPrivacy={() => setLegalView("privacy")}
          onOpenTerms={() => setLegalView("terms")}
          onOpenContact={() => setLegalView("contact")}
        />
      )}
    </SafeAreaView>
  );
}

function LoginScreen({ onLogin, onOpenPrivacy, onOpenTerms, onOpenContact }) {
  const [mode, setMode] = useState("teacher");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadSavedLogin(mode)
      .then((savedLogin) => {
        if (cancelled) return;

        if (savedLogin?.identity && savedLogin?.password) {
          setIdentity(savedLogin.identity);
          setPassword(savedLogin.password);
          setRememberPassword(true);
          return;
        }

        setIdentity("");
        setPassword("");
        setRememberPassword(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRememberPassword(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const submit = async () => {
    if (!identity.trim() || !password) {
      setError("Login details bharna zaruri hai.");
      return;
    }

    if (!agreed) {
      setError("Privacy Policy aur Terms & Conditions accept karna zaruri hai.");
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

      const nextSession = {
        role: mode,
        token,
        refreshToken: getRefreshToken(response),
        tokenExpiresAt: getTokenExpiresAt(response),
        user: response.user,
        mustResetPassword: mode === "student" ? getMustResetPassword(response) : false,
        savedAt: new Date().toISOString(),
      };

      if (rememberPassword) {
        await saveSavedLogin(mode, { identity, password });
      } else {
        await clearSavedLogin(mode);
      }

      await onLogin(nextSession);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.portalShell}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.portalContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.portalFrame}>
          <View style={styles.portalPhotoLayer}>
            <Image source={schoolCelebration} style={styles.portalPhotoImage} resizeMode="cover" />
            <View style={styles.portalPhotoWash} />
          </View>
          <View style={styles.portalWhiteSheet} />
          <View style={styles.portalGoldArc} />

          <View style={styles.portalHero}>
            <View style={styles.portalLogoWrap}>
              <View style={styles.portalLogoGlow} />
              <View style={styles.portalLogoRing}>
                <Image source={schoolLogo} style={styles.portalLogoImage} resizeMode="contain" />
              </View>
            </View>

            <View style={styles.portalEyebrowRow}>
              <View style={styles.portalTinyLine} />
              <Text style={styles.portalEyebrow}>{SCHOOL_SHORT_NAME} MOBILE PORTAL</Text>
              <View style={styles.portalTinyLine} />
            </View>
            <Text style={styles.portalTitle}>{SCHOOL_NAME}</Text>
            <Text style={styles.portalSubtitle}>{SCHOOL_TAGLINE}</Text>

            <View style={styles.portalDivider}>
              <View style={styles.portalDividerLine} />
              <Text style={styles.portalDividerStar}>*</Text>
              <View style={styles.portalDividerLine} />
            </View>

            <View style={styles.portalFeatureRow}>
              <View style={styles.portalFeatureCard}>
                <View style={[styles.portalFeatureIcon, styles.portalFeatureIconBlue]}>
                  <Image source={iconCheckout} style={[styles.portalFeatureIconImage, styles.portalFeatureIconImageBlue]} resizeMode="contain" />
                </View>
                <Text style={styles.portalFeatureTitle}>Teachers</Text>
                <Text style={styles.portalFeatureText}>Manage classes</Text>
              </View>
              <View style={styles.portalFeatureCard}>
                <View style={[styles.portalFeatureIcon, styles.portalFeatureIconGreen]}>
                  <Image source={iconStudents} style={[styles.portalFeatureIconImage, styles.portalFeatureIconImageGreen]} resizeMode="contain" />
                </View>
                <Text style={styles.portalFeatureTitle}>Students</Text>
                <Text style={styles.portalFeatureText}>Track learning</Text>
              </View>
              <View style={styles.portalFeatureCard}>
                <View style={[styles.portalFeatureIcon, styles.portalFeatureIconGold]}>
                  <Image source={iconAttendance} style={[styles.portalFeatureIconImage, styles.portalFeatureIconImageGold]} resizeMode="contain" />
                </View>
                <Text style={styles.portalFeatureTitle}>Attendance</Text>
                <Text style={styles.portalFeatureText}>Daily updates</Text>
              </View>
            </View>
          </View>

          <View style={styles.portalSegment}>
            <View style={[styles.portalSegmentThumb, mode === "student" && styles.portalSegmentThumbRight]} />
            <Pressable onPress={() => setMode("teacher")} style={styles.portalSegmentButton}>
              <Text style={[styles.portalSegmentText, mode === "teacher" && styles.portalSegmentTextActive]}>Teacher</Text>
            </Pressable>
            <Pressable onPress={() => setMode("student")} style={styles.portalSegmentButton}>
              <Text style={[styles.portalSegmentText, mode === "student" && styles.portalSegmentTextActive]}>Student</Text>
            </Pressable>
          </View>

          <View style={styles.portalFormCard}>
            <Text style={styles.portalFormTitle}>Welcome Back!</Text>
            <Text style={styles.portalFormSubtitle}>Sign in to continue to your dashboard</Text>

            <Text style={styles.portalLabel}>{mode === "teacher" ? "EMAIL" : "USERNAME"}</Text>
            <View style={styles.portalInputShell}>
              <View style={styles.portalInputIcon}>
                <Text style={styles.portalInputIconText}>{mode === "teacher" ? "✉" : "👤"}</Text>
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={mode === "teacher" ? "email-address" : "default"}
                onChangeText={setIdentity}
                placeholder={mode === "teacher" ? "teacher@school.com" : "student username"}
                placeholderTextColor="#a3adbc"
                style={styles.portalInput}
                value={identity}
              />
            </View>

            <Text style={styles.portalLabel}>{mode === "teacher" ? "PASSWORD" : "PASSWORD"}</Text>
            <View style={styles.portalInputShell}>
              <View style={styles.portalInputIcon}>
                <Text style={styles.portalInputIconText}>🔒</Text>
              </View>
              <TextInput
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#a3adbc"
                secureTextEntry={!showPassword}
                style={styles.portalInput}
                value={password}
              />
              <Pressable onPress={() => setShowPassword((current) => !current)} style={styles.portalEyeButton}>
                <Text style={styles.portalEyeText}>{showPassword ? "◉" : "◌"}</Text>
              </Pressable>
            </View>

            {mode === "student" ? <Text style={styles.portalHelperText}>First login me apni date of birth use karein. Login ke baad password set karna mandatory hai.</Text> : null}
            {error ? <Text style={styles.portalErrorText}>{error}</Text> : null}

            <View style={styles.portalOptionsRow}>
              <Pressable
                onPress={() => setRememberPassword((current) => !current)}
                style={styles.portalRememberRow}
              >
                <View style={[styles.portalCheckBox, rememberPassword && styles.portalCheckBoxActive]}>
                  <Text style={styles.portalCheckText}>✓</Text>
                </View>
                <Text style={styles.portalRememberText}>Save password</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert("Forgot Password", "Please contact the school office.")}>
                <Text style={styles.portalForgotText}>Forgot Password?</Text>
              </Pressable>
            </View>

            <View style={styles.portalConsentRow}>
              <Pressable
                onPress={() => setAgreed((current) => !current)}
                style={[styles.portalConsentBox, agreed && styles.portalConsentBoxActive]}
              >
                <Text style={styles.portalConsentCheck}>{agreed ? "✓" : ""}</Text>
              </Pressable>
              <Text style={styles.portalConsentText}>I agree to the Privacy Policy and Terms &amp; Conditions.</Text>
            </View>

            <Pressable disabled={loading || !agreed} onPress={submit} style={[styles.portalLoginButton, (loading || !agreed) && styles.disabledButton]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.portalLoginText}>Login</Text>}
            </Pressable>

            <View style={styles.portalLegalLinksRow}>
              <Pressable onPress={onOpenPrivacy} style={styles.portalLegalLinkButton}>
                <Text style={styles.portalLegalLinkText}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={onOpenTerms} style={styles.portalLegalLinkButton}>
                <Text style={styles.portalLegalLinkText}>Terms & Conditions</Text>
              </Pressable>
              <Pressable onPress={onOpenContact} style={styles.portalLegalLinkButton}>
                <Text style={styles.portalLegalLinkText}>Contact School</Text>
              </Pressable>
            </View>

          </View>

          <View style={styles.portalFooter}>
            <Text style={styles.portalFooterText}>
              Education is the most powerful weapon which you can use to change the world.
            </Text>
            <Text style={styles.portalFooterAuthor}>- Nelson Mandela</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StudentPasswordSetup({ session, onComplete, onLogout }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      setError("New password aur confirm password dono bharna zaruri hai.");
      return;
    }

    if (password.length < 6) {
      setError("Password kam se kam 6 characters ka hona chahiye.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords match nahi kar rahe.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await setStudentPassword(session.token, {
        new_password: password,
        confirm_password: confirmPassword,
      });

      await onComplete({
        ...session,
        mustResetPassword: false,
        user: {
          ...(session.user || {}),
          ...(response.user || {}),
          mustResetPassword: false,
        },
      });
    } catch (err) {
      setError(err.message || "Password set failed");
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
          <Text style={styles.brandKicker}>Mandatory Setup</Text>
          <Text style={styles.brandTitle}>Set Your Password</Text>
          <Text style={styles.brandSubtitle}>
            First login complete ho gaya hai. Ab account secure karne ke liye naya password set karo.
          </Text>
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.inputLabel}>Username</Text>
          <TextInput
            editable={false}
            style={[styles.input, styles.readOnlyInput]}
            value={session.user?.username || session.user?.name || ""}
          />

          <Text style={styles.inputLabel}>New Password</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="New password"
            placeholderTextColor="#8a8f98"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <Text style={styles.inputLabel}>Confirm Password</Text>
          <TextInput
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            placeholderTextColor="#8a8f98"
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
          />

          <Text style={styles.helperText}>
            Is password ke baad future login me DOB ki jagah yehi password use hoga.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable disabled={loading} onPress={submit} style={[styles.primaryButton, loading && styles.disabledButton]}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.buttonContentRow}>
                <Feather name="lock" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Set Password</Text>
              </View>
            )}
          </Pressable>

          <Pressable onPress={onLogout} style={[styles.logoutButton, { marginTop: 10, alignItems: "center" }]}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StudentProfilePage({ student, onBack, onLogout, onOpenPrivacy, onOpenTerms, onOpenContact }) {
  const sections = [
    {
      title: "Identity",
      items: [
        { label: "Name", value: getStudentDisplayName(student) },
        { label: "Username", value: student?.username || "-" },
        { label: "Date of Birth", value: formatProfileDate(student?.dateOfBirth || student?.date_of_birth) },
        { label: "Gender", value: student?.gender || "-" },
      ],
    },
    {
      title: "Academic",
      items: [
        { label: "Class", value: student?.class || "-" },
        { label: "Section", value: student?.section || "-" },
        { label: "Roll No", value: student?.rollNo || student?.roll_no || "-" },
        { label: "Academic Year", value: student?.academicYear || student?.academic_year || "-" },
        { label: "Status", value: student?.status || "-" },
      ],
    },
    {
      title: "Family",
      items: [
        { label: "Father Name", value: student?.fatherName || student?.father_name || "-" },
        { label: "Mother Name", value: student?.motherName || student?.mother_name || "-" },
      ],
    },
    {
      title: "Contact",
      items: [
        { label: "Mobile", value: student?.mobile || "-" },
        { label: "Address", value: student?.address || "-" },
      ],
    },
    {
      title: "Admission",
      items: [
        { label: "Aadhaar", value: student?.aadhaarCard || student?.aadhaar_card || "-" },
        { label: "PEN", value: student?.penNumber || student?.pen_number || "-" },
        { label: "Admission No.", value: student?.admissionNumber || student?.admission_number || "-" },
        { label: "Admission Date", value: formatProfileDate(student?.admissionDate || student?.admission_date) },
        { label: "Transport", value: student?.usesTransport || student?.uses_transport ? "Yes" : "No" },
        { label: "Transport Charge", value: student?.transportCharge ?? student?.transport_charge ?? "-" },
      ],
    },
  ];

  return (
    <View style={styles.profilePageShell}>
      <View style={styles.profilePageTopRow}>
        <Pressable onPress={onBack} style={styles.profileBackButton}>
          <Text style={styles.profileBackButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.profilePageKicker}>Student Profile</Text>
        <View style={styles.profilePageSpacer} />
      </View>

      <View style={styles.profileHeroCard}>
        <View style={styles.profileHeroAvatar}>
          <Image source={getProfilePhotoSource(student)} style={styles.profileHeroAvatarImage} resizeMode="cover" />
        </View>
        <View style={styles.profileHeroText}>
          <Text style={styles.profileHeroName}>{getStudentDisplayName(student)}</Text>
          <Text style={styles.profileHeroMeta}>
            {student?.class ? `Class ${student.class}${student?.section ? `-${student.section}` : ""}` : "Student"}
          </Text>
          <Text style={styles.profileHeroSubMeta}>Username: {student?.username || "-"}</Text>
        </View>
      </View>

      <View style={styles.profileGrid}>
        {sections.map((section) => (
          <View key={section.title} style={styles.profileSectionCard}>
            <Text style={styles.profileSectionTitle}>{section.title}</Text>
            <View style={styles.profileFieldGrid}>
              {section.items.map((item) => (
                <View key={item.label} style={styles.profileFieldCard}>
                  <Text style={styles.profileDetailLabel}>{item.label}</Text>
                  <Text style={styles.profileDetailValue}>{String(item.value || "-")}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.profileMenuCard}>
        <Text style={styles.profileMenuTitle}>Profile Menu</Text>
        <View style={styles.profileMenuGrid}>
          <Pressable onPress={onOpenPrivacy} style={styles.profileMenuButton}>
            <Text style={styles.profileMenuButtonText}>Privacy Policy</Text>
          </Pressable>
          <Pressable onPress={onOpenTerms} style={styles.profileMenuButton}>
            <Text style={styles.profileMenuButtonText}>Terms & Conditions</Text>
          </Pressable>
          <Pressable onPress={onOpenContact} style={styles.profileMenuButton}>
            <Text style={styles.profileMenuButtonText}>Contact School</Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={onLogout} style={[styles.logoutButton, styles.profileLogoutButton]}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

function LegalScreen({ type, onBack }) {
  const isPrivacy = type === "privacy";
  const isTerms = type === "terms";
  const title = isPrivacy ? "Privacy Policy" : isTerms ? "Terms & Conditions" : "Contact School";
  const points = isPrivacy ? privacyPolicyPoints : isTerms ? termsPoints : [];

  const openContact = (target) => {
    Linking.openURL(target).catch(() => {
      Alert.alert("Unable to open link", target);
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.legalShell}>
      <View style={styles.legalCard}>
        <View style={styles.legalHeaderRow}>
          <Pressable onPress={onBack} style={styles.legalBackButton}>
            <Text style={styles.legalBackButtonText}>Back</Text>
          </Pressable>
          <View style={styles.legalHeaderText}>
            <Text style={styles.legalKicker}>School ERP</Text>
            <Text style={styles.legalTitle}>{title}</Text>
          </View>
        </View>

        <Text style={styles.legalIntro}>
          {isPrivacy
            ? "This policy explains the basic information collected by the school app, why it is needed and how families can contact the school."
            : isTerms
              ? "These simple terms explain how the app should be used by teachers, students and parents."
              : "Use the contact details below for data correction, deletion requests or general privacy support."}
        </Text>

        {points.length ? (
          <View style={styles.legalPoints}>
            {points.map((point) => (
              <View key={point} style={styles.legalPointRow}>
                <Text style={styles.legalPointBullet}>•</Text>
                <Text style={styles.legalPointText}>{point}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.legalContactCard}>
          <Text style={styles.legalSectionTitle}>School Contact</Text>
          <Text style={styles.legalContactText}>School Name: {SCHOOL_NAME}</Text>
          <Text style={styles.legalContactText}>Email: {SCHOOL_EMAIL}</Text>
          <Text style={styles.legalContactText}>Phone: {SCHOOL_PHONE}</Text>
          <Text style={styles.legalContactText}>Address: {SCHOOL_ADDRESS}</Text>
          <Text style={styles.legalContactText}>Office Hours: {SCHOOL_SUPPORT_HOURS}</Text>
        </View>

        {type === "contact" ? (
          <View style={styles.legalButtonRow}>
            <Pressable onPress={() => openContact(`tel:${SCHOOL_PHONE.replace(/\s/g, "")}`)} style={styles.legalActionButton}>
              <Text style={styles.legalActionButtonText}>Call</Text>
            </Pressable>
            <Pressable onPress={() => openContact(`mailto:${SCHOOL_EMAIL}`)} style={styles.legalActionButton}>
              <Text style={styles.legalActionButtonText}>Email</Text>
            </Pressable>
            <Pressable
              onPress={() => openContact(`https://maps.google.com/?q=${encodeURIComponent(SCHOOL_ADDRESS)}`)}
              style={styles.legalActionButton}
            >
              <Text style={styles.legalActionButtonText}>Map</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.legalFooterCard}>
          <Text style={styles.legalFooterText}>
            The school may update these pages from time to time. Please check them again after app updates.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Dashboard({ session, onLogout, onOpenPrivacy, onOpenTerms, onOpenContact }) {
  const [activeTab, setActiveTab] = useState("home");
  const [studentProfile, setStudentProfile] = useState(session.user || null);
  const tabSections = session.role === "teacher" ? teacherTabSections : studentTabSections;
  const activeSection = useMemo(() => getActiveTabSection(tabSections, activeTab), [activeTab, tabSections]);
  const showStudentProfilePage = session.role === "student" && activeTab === "profile";

  useEffect(() => {
    setActiveTab(tabSections[0]?.tabs[0]?.key || "home");
  }, [session.role]);

  useEffect(() => {
    if (session.role === "student" && activeTab === "profile") {
      return;
    }

    const hasActiveTab = tabSections.some((section) => section.tabs.some((tab) => tab.key === activeTab));
    if (!hasActiveTab) {
      setActiveTab(tabSections[0]?.tabs[0]?.key || "home");
    }
  }, [activeTab, session.role, tabSections]);

  useEffect(() => {
    if (session.role === "student") {
      setStudentProfile(session.user || null);
      return;
    }

    setStudentProfile(null);
  }, [session.role, session.user]);

  useEffect(() => {
    if (session.role !== "student") return undefined;

    let cancelled = false;

    const syncPushToken = async () => {
      try {
        await registerStudentDeviceToken(session);
      } catch (error) {
        if (!cancelled) {
          console.warn("Student push token setup failed:", error.message);
        }
      }
    };

    syncPushToken();

    return () => {
      cancelled = true;
    };
  }, [session.role, session.token, session.user?.id]);

  return (
    <View style={styles.appShell}>
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <Image source={schoolLogo} style={styles.headerLogo} resizeMode="contain" />
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerSchool}>{SCHOOL_NAME}</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {session.role === "teacher"
                ? session.user?.email || session.user?.name || `${SCHOOL_SHORT_NAME} Mobile`
                : session.user?.name || session.user?.email || `${SCHOOL_SHORT_NAME} Mobile`}
            </Text>
            {session.role === "teacher" ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Teacher</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.headerActions}>
          {session.role === "teacher" ? (
            <Pressable onPress={onLogout} style={styles.dashboardLogoutButton}>
              <Text style={styles.dashboardLogoutIconText}>⇥</Text>
              <Text style={styles.dashboardLogoutText}>Logout</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setActiveTab("profile")}
              style={styles.profileButton}
              accessibilityRole="button"
              accessibilityLabel="Open student profile"
            >
              <View style={styles.profileAvatar}>
                <Image
                  source={getProfilePhotoSource(studentProfile || session.user)}
                  style={styles.profileAvatarImage}
                  resizeMode="cover"
                />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {session.role === "teacher" ? (
        <TeacherArea
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sectionTabs={activeSection?.tabs || []}
          session={session}
        />
      ) : (
        <StudentArea
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sectionTabs={activeSection?.tabs || []}
          session={session}
          onStudentLoaded={setStudentProfile}
          onLogout={onLogout}
          onOpenPrivacy={onOpenPrivacy}
          onOpenTerms={onOpenTerms}
          onOpenContact={onOpenContact}
        />
      )}

      {showStudentProfilePage ? null : (
        <View style={styles.tabDock}>
          <View style={styles.parentTabScroller}>
            <View style={styles.parentTabBar}>
              {tabSections.map((section) => {
                const isActive = activeSection?.key === section.key;
                const firstTabKey = section.tabs[0]?.key || "home";

                return (
                  <Pressable
                    key={section.key}
                    onPress={() => setActiveTab(firstTabKey)}
                    style={[styles.parentTabButton, isActive && styles.parentTabButtonActive]}
                  >
                    <View style={[styles.parentTabBadge, isActive && styles.parentTabBadgeActive]}>
                      <Image
                        source={getSectionIcon(section.key)}
                        style={[
                          styles.parentTabBadgeImage,
                          { tintColor: isActive ? "#fff" : "#63708a" },
                        ]}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.parentTabText, isActive && styles.parentTabTextActive]}>{section.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function TeacherArea({ activeTab, onTabChange, sectionTabs, session }) {
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
      Alert.alert("Attendance missing", "All studenska status select karein.");
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
      <SectionTabsBar tabs={sectionTabs} activeTab={activeTab} onTabChange={onTabChange} />
      {error ? <Notice tone="error" text={error} /> : null}
      {message ? <Notice tone={saved ? "success" : "info"} text={message} /> : null}

      {activeTab === "home" ? (
        <TeacherHome
          assignment={selectedAssignment}
          onOpen={onTabChange}
          records={records}
          students={students}
        />
      ) : null}

      {activeTab === "students" ? <StudentList students={students} /> : null}

      {activeTab === "gpsAttendance" ? (
        <TeacherGpsAttendancePanel session={session} />
      ) : null}

      {activeTab === "gpsHistory" ? (
        <TeacherGpsHistoryPanel session={session} />
      ) : null}

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

function StudentArea({
  activeTab,
  onTabChange,
  sectionTabs,
  session,
  onStudentLoaded,
  onLogout,
  onOpenPrivacy,
  onOpenTerms,
  onOpenContact,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [studentProfile, setStudentProfile] = useState(session.user || null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await getStudentAttendance(session.token, session.user?.id);
      setDetail(response);
      const mergedStudent = {
        ...(session.user || {}),
        ...(response?.student || {}),
      };
      setStudentProfile(mergedStudent);
      onStudentLoaded?.(mergedStudent);
    } catch (err) {
      setError(err.message || "Student data load failed");
      setStudentProfile(session.user || null);
      onStudentLoaded?.(session.user || null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onStudentLoaded, session.token, session.user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setStudentProfile(session.user || null);
  }, [session.user]);

  if (loading) return <LoadingBlock label="Student dashboard loading..." />;

  const student = studentProfile || detail?.student || session.user;
  const records = detail?.records || [];
  const summary = detail?.summary || summarizeRecords(records);

  if (activeTab === "profile") {
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
        <StudentProfilePage
          student={student}
          onBack={() => onTabChange("home")}
          onLogout={onLogout}
          onOpenPrivacy={onOpenPrivacy}
          onOpenTerms={onOpenTerms}
          onOpenContact={onOpenContact}
        />
      </ScrollView>
    );
  }

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
      {sectionTabs.length > 1 ? <SectionTabsBar tabs={sectionTabs} activeTab={activeTab} onTabChange={onTabChange} /> : null}
      {error ? <Notice tone="error" text={error} /> : null}
      {activeTab === "home" ? <StudentHome session={session} student={student} summary={summary} /> : null}
      {activeTab === "attendance" ? <StudentAttendance records={records} summary={summary} /> : null}
      {activeTab === "leave" ? <StudentLeavePanel session={session} student={student} /> : null}
      {activeTab === "holidays" ? <HolidayCalendarPanel session={session} /> : null}
      {activeTab === "fees" ? <StudentFeeDashboardPanel session={session} student={student} /> : null}
      {activeTab === "results" ? <StudentResultsPanel student={student} /> : null}
    </ScrollView>
  );
}

function SectionTabsBar({ tabs, activeTab, onTabChange }) {
  if (!tabs?.length) return null;

  return (
    <View style={styles.sectionTabsWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabsScroller} contentContainerStyle={styles.sectionTabsBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={[styles.sectionTabButton, active && styles.sectionTabButtonActive]}
            >
              <View style={[styles.sectionTabIcon, active && styles.sectionTabIconActive]} />
              <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TeacherHome({ assignment, onOpen, records, students }) {
  const summary = summarizeRecords(records);
  const academicYear = assignment?.academic_year || getDefaultAcademicYear();
  const classLabel = assignment ? `Class ${assignment.class} - ${assignment.section}` : "No assignment";

  return (
    <View style={styles.teacherHomeShell}>
      <View style={styles.teacherClassCard}>
        <View style={styles.teacherClassTopRow}>
          <View style={styles.teacherClassLogoWrap}>
            <Image source={schoolLogo} style={styles.teacherClassLogo} resizeMode="contain" />
          </View>
          <View style={styles.teacherClassTextBlock}>
            <Text style={styles.teacherClassSchool}>{SCHOOL_NAME}</Text>
            <Text style={styles.teacherClassMeta}>Teacher Workspace</Text>
          </View>
        </View>
        <Text style={styles.teacherClassTitle}>{classLabel}</Text>
        <View style={styles.teacherClassYearRow}>
          <Feather name="calendar" size={12} color="#d9e8ff" />
          <Text style={styles.teacherClassYear}>Academic Year {academicYear}</Text>
        </View>
        <View style={styles.teacherClassArt}>
          <Image source={bookIllustration} style={styles.teacherClassArtImage} resizeMode="contain" />
        </View>
      </View>

      <View style={styles.teacherStatsGrid}>
        <View style={[styles.teacherStatCard, styles.teacherStatBlue]}>
          <View style={styles.teacherStatIconWrap}>
            <Image source={iconStudents} style={[styles.teacherStatIconImage, { tintColor: "#2a64e8" }]} resizeMode="contain" />
          </View>
          <View style={styles.teacherStatBody}>
            <Text style={styles.teacherStatLabel}>Students</Text>
            <Text style={styles.teacherStatValue}>{students.length}</Text>
            <Text style={styles.teacherStatMeta}>Total Students</Text>
          </View>
        </View>
        <View style={[styles.teacherStatCard, styles.teacherStatGreen]}>
          <View style={styles.teacherStatIconWrap}>
            <Image source={iconCheckout} style={[styles.teacherStatIconImage, { tintColor: "#18a05e" }]} resizeMode="contain" />
          </View>
          <View style={styles.teacherStatBody}>
            <Text style={styles.teacherStatLabel}>Present</Text>
            <Text style={styles.teacherStatValue}>{summary.present}</Text>
            <Text style={styles.teacherStatMeta}>Present Today</Text>
          </View>
        </View>
        <View style={[styles.teacherStatCard, styles.teacherStatRed]}>
          <View style={styles.teacherStatIconWrap}>
            <Image source={iconStudents} style={[styles.teacherStatIconImage, { tintColor: "#ef4a4a" }]} resizeMode="contain" />
          </View>
          <View style={styles.teacherStatBody}>
            <Text style={styles.teacherStatLabel}>Absent</Text>
            <Text style={styles.teacherStatValue}>{summary.absent}</Text>
            <Text style={styles.teacherStatMeta}>Absent Today</Text>
          </View>
        </View>
        <View style={[styles.teacherStatCard, styles.teacherStatAmber]}>
          <View style={styles.teacherStatIconWrap}>
            <Image source={iconHistory} style={[styles.teacherStatIconImage, { tintColor: "#ff9d00" }]} resizeMode="contain" />
          </View>
          <View style={styles.teacherStatBody}>
            <Text style={styles.teacherStatLabel}>Late</Text>
            <Text style={styles.teacherStatValue}>{summary.late}</Text>
            <Text style={styles.teacherStatMeta}>Late Today</Text>
          </View>
        </View>
      </View>

      <View style={styles.teacherFeatureSection}>
        <View style={styles.teacherSectionTitleWrap}>
          <Text style={styles.teacherSectionTitle}>Teacher Features</Text>
          <View style={styles.teacherSectionUnderline} />
        </View>
        <View style={styles.teacherFeatureList}>
          {teacherFeatures.map((feature) => (
            <Pressable
              key={feature.key}
              onPress={() => onOpen(feature.key)}
              style={styles.teacherFeatureItem}
            >
              <View style={styles.teacherFeatureIcon}>
                <Image source={getTeacherFeatureIcon(feature.key)} style={styles.teacherFeatureIconImage} resizeMode="contain" />
              </View>
              <View style={styles.teacherFeatureBody}>
                <Text style={styles.teacherFeatureTitle}>{feature.label}</Text>
                <Text style={styles.teacherFeatureMeta}>{feature.meta}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#7b8797" />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function StudentHome({ session, student, summary }) {
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

      <View style={styles.homeSectionCard}>
        <StudentNotificationsPanel session={session} limit={8} />
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
          editable={false}
          selectTextOnFocus={false}
          style={[styles.input, styles.readOnlyInput]}
          value={formatDisplayDate(date)}
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
          <View style={styles.buttonContentRow}>
            <Feather name={isHoliday ? "slash" : disabled ? "check-circle" : "calendar"} size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isHoliday ? "Holiday - No Attendance" : disabled ? "Attendance Saved" : "Save Attendance"}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const requestLocationPermission = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
};

const getCurrentLocation = async () => {
  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error("Location permission denied. Attendance mark nahi ho sakta.");
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("Location service off hai. Service on karke dobara try karein.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
};

function TeacherGpsAttendancePanel({ session }) {
  const [detail, setDetail] = useState(null);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checkoutForm, setCheckoutForm] = useState({ reason: "Forgot Checkout", remarks: "" });
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "Casual Leave",
    from_date: todayIso(),
    to_date: todayIso(),
    reason: "",
  });
  const [leaveTypeOpen, setLeaveTypeOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setDetailLoaded(false);
    setDetail(null);
    try {
      const [todayResponse, leavesResponse] = await Promise.all([
        getTeacherAttendanceToday(session.token),
        getTeacherLeaves(session.token),
      ]);
      setDetail(todayResponse);
      setDetailLoaded(true);
      if (todayResponse?.settings_error) {
        setError(todayResponse.settings_error);
      }
      setLeaves(leavesResponse?.leaves || []);
    } catch (err) {
      setError(err.message || "Attendance load failed");
    } finally {
      setLoading(false);
      setSaving(false);
    }
  }, [session.token]);

  useEffect(() => {
    load();
  }, [load]);

  const runGpsAction = async (action) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const location = await getCurrentLocation();
      const payload = {
        date: todayIso(),
        location,
        device_id: `${Platform.OS}-${session.user?.id || "teacher"}`,
      };
      const response =
        action === "checkIn"
          ? await teacherCheckIn(session.token, payload)
          : await teacherCheckOut(session.token, payload);
      setMessage(response?.message || "Attendance saved.");
      await load();
    } catch (err) {
      setError(err.message || "Attendance failed");
    } finally {
      setSaving(false);
    }
  };

  const submitPendingCheckout = async (request) => {
    if (!request?.id) return;
    if (checkoutForm.reason === "Other" && !checkoutForm.remarks.trim()) {
      setError("Other reason ke liye remarks required hai.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await submitCheckoutExplanation(session.token, request.id, checkoutForm);
      setMessage("Checkout explanation submitted.");
      setCheckoutForm({ reason: "Forgot Checkout", remarks: "" });
      await load();
    } catch (err) {
      setError(err.message || "Explanation submit failed");
    } finally {
      setSaving(false);
    }
  };

  const submitLeave = async () => {
    if (!leaveForm.reason.trim()) {
      setError("Leave reason required hai.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await submitTeacherLeave(session.token, leaveForm);
      setMessage("Leave request submitted.");
      setLeaveForm({ leave_type: "Casual Leave", from_date: todayIso(), to_date: todayIso(), reason: "" });
      setLeaveTypeOpen(false);
      await load();
    } catch (err) {
      setError(err.message || "Leave request failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Attendance loading..." />;

  const attendance = detail?.attendance;
  const pendingCheckout = detail?.pendingCheckout || [];
  const lockedRequest = pendingCheckout[0];
  const settings = detail?.settings;
  const settingsMissing = detailLoaded && !error && !settings && !detail?.settings_error;

  return (
    <View>
      {error ? <Notice tone="error" text={error} /> : null}
      {message ? <Notice tone="success" text={message} /> : null}

      {settingsMissing ? (
        <Notice tone="error" text="School location settings configure nahi hai. Admin se setup karwayein." />
      ) : null}

      {lockedRequest ? (
        <View style={styles.marksCard}>
          <View style={styles.inlineTitleRow}>
            <Feather name="alert-triangle" size={18} color="#1458bf" />
            <Text style={styles.sectionTitle}>Checkout Missing</Text>
          </View>
          <Text style={styles.rowMeta}>
            {lockedRequest.attendance_date} | Check in {lockedRequest.check_in_at ? new Date(lockedRequest.check_in_at).toLocaleTimeString("en-IN") : "-"}
          </Text>
          <Text style={styles.inputLabel}>Reason</Text>
          <View style={styles.statusRow}>
            {checkoutReasonOptions.map((reason) => (
              <Pressable
                key={reason.value}
                onPress={() => setCheckoutForm((prev) => ({ ...prev, reason: reason.value }))}
                style={[styles.statusButton, checkoutForm.reason === reason.value && styles.statusButtonActive]}
              >
                <Text style={[styles.statusText, checkoutForm.reason === reason.value && styles.statusTextActive]}>{reason.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.inputLabel}>Remarks</Text>
          <TextInput
            onChangeText={(value) => setCheckoutForm((prev) => ({ ...prev, remarks: value }))}
            placeholder="Explanation"
            placeholderTextColor="#8a8f98"
            style={styles.input}
            value={checkoutForm.remarks}
          />
          <Pressable disabled={saving} onPress={() => submitPendingCheckout(lockedRequest)} style={[styles.primaryButton, saving && styles.disabledButton]}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.buttonContentRow}>
                <Feather name="edit-3" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Submit Explanation</Text>
              </View>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.heroPanel}>
        <Text style={styles.panelEyebrow}>Daily Check In/Out</Text>
        <Text style={styles.panelTitle}>{statusLabels[attendance?.status] || "Not checked in"}</Text>
        <Text style={styles.panelMeta}>
          Radius {settings?.radius_meters || "-"}m | Accuracy {settings?.gps_accuracy_meters || "-"}m | Deadline {String(settings?.checkout_deadline || "-").slice(0, 5)}
        </Text>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard label="Check In" value={attendance?.check_in_at ? new Date(attendance.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"} tone="teal" />
        <MetricCard label="Check Out" value={attendance?.check_out_at ? new Date(attendance.check_out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"} tone="green" />
        <MetricCard label="Work Min" value={attendance?.working_minutes || 0} tone="amber" />
        <MetricCard label="Distance" value={attendance?.check_in_distance_meters ? `${Math.round(attendance.check_in_distance_meters)}m` : "--"} tone="red" />
      </View>

      <View style={styles.actionButtonRow}>
        <Pressable
          disabled={saving || !settings || Boolean(attendance?.check_in_at) || Boolean(lockedRequest)}
          onPress={() => runGpsAction("checkIn")}
          style={[
            styles.actionButton,
            styles.actionButtonSoft,
            (saving || !settings || Boolean(attendance?.check_in_at) || Boolean(lockedRequest)) && styles.disabledButton,
          ]}
        >
          <Feather name="log-in" size={18} color="#1458bf" />
          <Text style={styles.actionButtonText}>Check In</Text>
        </Pressable>
        <Pressable
          disabled={saving || !settings || !attendance?.check_in_at || Boolean(attendance?.check_out_at) || Boolean(lockedRequest)}
          onPress={() => runGpsAction("checkOut")}
          style={[
            styles.actionButton,
            styles.actionButtonPrimary,
            (saving || !settings || !attendance?.check_in_at || Boolean(attendance?.check_out_at) || Boolean(lockedRequest)) && styles.disabledButton,
          ]}
        >
          <Feather name="log-out" size={18} color="#fff" />
          <Text style={styles.actionButtonTextPrimary}>Check Out</Text>
        </Pressable>
      </View>

      <View style={[styles.marksCard, styles.topGap]}>
        <View style={styles.inlineTitleRow}>
          <Feather name="file-plus" size={18} color="#16a34a" />
          <Text style={styles.sectionTitle}>Apply Leave</Text>
        </View>
        <Text style={styles.inputLabel}>Leave Type</Text>
        <View style={styles.dropdownWrap}>
          <Pressable
            onPress={() => setLeaveTypeOpen((prev) => !prev)}
            style={[styles.input, styles.dropdownButton, leaveTypeOpen && styles.dropdownButtonActive]}
          >
            <Text style={styles.dropdownButtonText}>{leaveForm.leave_type}</Text>
            <Text style={styles.dropdownChevron}>{leaveTypeOpen ? "^" : "v"}</Text>
          </Pressable>
          {leaveTypeOpen ? (
            <View style={styles.dropdownMenu}>
              {leaveTypeOptions.map((option) => {
                const active = leaveForm.leave_type === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      setLeaveForm((prev) => ({ ...prev, leave_type: option }));
                      setLeaveTypeOpen(false);
                    }}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Text style={styles.inputLabel}>From Date</Text>
        <TextInput style={styles.input} value={leaveForm.from_date} onChangeText={(value) => setLeaveForm((prev) => ({ ...prev, from_date: value }))} placeholder="YYYY-MM-DD" placeholderTextColor="#8a8f98" />
        <Text style={styles.inputLabel}>To Date</Text>
        <TextInput style={styles.input} value={leaveForm.to_date} onChangeText={(value) => setLeaveForm((prev) => ({ ...prev, to_date: value }))} placeholder="YYYY-MM-DD" placeholderTextColor="#8a8f98" />
        <Text style={styles.inputLabel}>Reason</Text>
        <TextInput style={styles.input} value={leaveForm.reason} onChangeText={(value) => setLeaveForm((prev) => ({ ...prev, reason: value }))} placeholder="Reason" placeholderTextColor="#8a8f98" />
        <Pressable disabled={saving} onPress={submitLeave} style={[styles.primaryButton, saving && styles.disabledButton]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.buttonContentRow}>
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Submit Leave</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={[styles.list, styles.topGap]}>
        <View style={styles.inlineTitleRow}>
          <Feather name="clock" size={18} color="#1458bf" />
          <Text style={styles.sectionTitle}>Leave Status</Text>
        </View>
        {leaves.length ? leaves.slice(0, 5).map((leave) => (
          <View key={leave.id} style={styles.recordRow}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{leave.leave_type}</Text>
              <Text style={styles.rowMeta}>{leave.from_date} to {leave.to_date}</Text>
            </View>
            <StatusPill status={leave.status} />
          </View>
        )) : <EmptyState title="No leave" text="Abhi tak leave request nahi hai." />}
      </View>
    </View>
  );
}

function TeacherGpsHistoryPanel({ session }) {
  const [year, setYear] = useState(getCurrentYear());
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [monthOpen, setMonthOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (selectedYear = year) => {
    const normalizedYear = String(selectedYear || year || getCurrentYear()).replace(/\D/g, "").slice(0, 4);
    if (normalizedYear.length !== 4) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await getTeacherAttendanceRecords(session.token, { year: normalizedYear });
      setDetail(response);
    } catch (err) {
      setDetail(null);
      setError(err.message || "History load failed");
    } finally {
      setLoading(false);
    }
  }, [session.token, year]);

  useEffect(() => {
    load(year);
  }, [load, year]);

  const records = detail?.records || [];
  const monthlySummary = detail?.monthlySummary || [];
  const yearlySummary = detail?.yearlySummary || [];
  const monthOptions = useMemo(() => {
    const months = Array.from(
      new Set(
        records
          .map((record) => String(record.attendance_date || "").slice(0, 7))
          .filter((month) => month && month.length === 7),
      ),
    ).sort((a, b) => b.localeCompare(a));

    return [{ key: "all", label: "All Months" }, ...months.map((month) => ({ key: month, label: formatMonthLabel(month) }))];
  }, [records]);

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("all");
      return;
    }

    setSelectedMonth((current) => (monthOptions.some((option) => option.key === current) ? current : monthOptions[0].key));
  }, [monthOptions]);

  const filteredRecords = useMemo(() => {
    if (selectedMonth === "all") return records;
    return records.filter((record) => String(record.attendance_date || "").slice(0, 7) === selectedMonth);
  }, [records, selectedMonth]);

  const selectedMonthLabel =
    monthOptions.find((option) => option.key === selectedMonth)?.label || "All Months";
  const summary = selectedMonth === "all"
    ? (detail?.summary || {})
    : summarizeTeacherHistory(filteredRecords);

  return (
    <View>
      <View style={styles.heroPanel}>
        <Text style={styles.panelEyebrow}>Attendance History</Text>
        <Text style={styles.panelTitle}>Your Monthly and Yearly Attendance History</Text>
        <Text style={styles.panelMeta}>{selectedMonthLabel}</Text>
      </View>

      <View style={styles.inlineField}>
        <Text style={styles.inputLabel}>Year</Text>
        <TextInput
          onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))}
          placeholder="YYYY"
          placeholderTextColor="#8a8f98"
          style={styles.input}
          value={year}
        />
      </View>

      {records.length ? (
        <View style={styles.inlineField}>
          <Text style={styles.inputLabel}>Month</Text>
          <View style={styles.dropdownWrap}>
            <Pressable
              onPress={() => setMonthOpen((prev) => !prev)}
              style={[styles.input, styles.dropdownButton, monthOpen && styles.dropdownButtonActive]}
            >
              <Text style={styles.dropdownButtonText}>{selectedMonthLabel}</Text>
              <Text style={styles.dropdownChevron}>{monthOpen ? "^" : "v"}</Text>
            </Pressable>
            {monthOpen ? (
              <View style={styles.dropdownMenu}>
                {monthOptions.map((option) => {
                  const active = selectedMonth === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        setSelectedMonth(option.key);
                        setMonthOpen(false);
                      }}
                      style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                    >
                      <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label="History loading..." /> : null}

      {!loading ? (
        <View>
          <View style={styles.metricGrid}>
            <MetricCard label="Working Days" value={summary.working_days || 0} tone="teal" />
            <MetricCard label="Present" value={summary.present || 0} tone="green" />
            <MetricCard label="Late" value={summary.late || 0} tone="amber" />
            <MetricCard label="Half Day" value={summary.half_day || 0} tone="teal" />
          </View>
          <View style={styles.metricGrid}>
            <MetricCard label="Absent" value={summary.absent || 0} tone="red" />
            <MetricCard label="Leave" value={summary.leave || 0} tone="teal" />
            <MetricCard label="Checkout Missing" value={summary.checkout_missing || 0} tone="red" />
            <MetricCard label="Records" value={selectedMonth === "all" ? detail?.count || 0 : filteredRecords.length} tone="teal" />
          </View>

          <View style={[styles.list, styles.topGap]}>
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
            {monthlySummary.length ? monthlySummary.map((row) => (
              <Pressable
                key={row.key}
                onPress={() => setSelectedMonth(row.key)}
                style={[styles.recordRow, selectedMonth === row.key && styles.recordRowActive]}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{formatMonthLabel(row.key)}</Text>
                  <Text style={styles.rowMeta}>
                    Working {row.working_days || 0} | Present {row.present || 0} | Late {row.late || 0}
                  </Text>
                  <Text style={styles.rowSub}>
                    Half {row.half_day || 0} | Absent {row.absent || 0} | Leave {row.leave || 0}
                  </Text>
                </View>
                <Text style={styles.monthBreakdownValue}>{row.working_days || 0}</Text>
              </Pressable>
            )) : <EmptyState title="No history" text="Is year ke liye history records nahi mile." />}
          </View>

          <View style={[styles.list, styles.topGap]}>
            <Text style={styles.sectionTitle}>Year Summary</Text>
            {yearlySummary.length ? yearlySummary.map((row) => (
              <View key={row.key} style={styles.recordRow}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>Year {row.key}</Text>
                  <Text style={styles.rowMeta}>
                    Working {row.working_days || 0} | Present {row.present || 0} | Late {row.late || 0}
                  </Text>
                </View>
                <Text style={styles.rowSub}>{row.total_records || 0} records</Text>
              </View>
            )) : <EmptyState title="No yearly summary" text="Year summary available nahi hai." />}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SubmitMarksPanel({ assignment, session, students }) {
  const [terminal, setTerminal] = useState("First");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [terminalOpen, setTerminalOpen] = useState(false);
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
      <View style={styles.inlineTitleRow}>
        <Feather name="edit" size={18} color="#1458bf" />
        <Text style={styles.sectionTitle}>Submit Marks</Text>
      </View>
      <View style={styles.inlineField}>
        <Text style={styles.inputLabel}>Terminal</Text>
        <View style={styles.dropdownWrap}>
          <Pressable
            onPress={() => {
              setTerminalOpen((prev) => !prev);
            }}
            style={[styles.input, styles.dropdownButton, terminalOpen && styles.dropdownButtonActive]}
          >
            <Text style={styles.dropdownButtonText}>{terminal || "Select terminal"}</Text>
            <Text style={styles.dropdownChevron}>{terminalOpen ? "^" : "v"}</Text>
          </Pressable>
          {terminalOpen ? (
            <View style={styles.dropdownMenu}>
              {terminals.map((item) => {
                const active = terminal === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setTerminal(item);
                      setTerminalOpen(false);
                    }}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      <StudentDropdown
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
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.buttonContentRow}>
            <Feather name="save" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Submit Marks</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function ViewMarksPanel({ assignment, session }) {
  const [terminal, setTerminal] = useState("First");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expandedStudents, setExpandedStudents] = useState({});
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
  const studentRows = rows.map((student) => {
    const marks = student.marks || [];
    const submitted = marks.filter((mark) => mark.status === "SUBMITTED" || mark.status === "LOCKED").length;
    const pending = marks.filter((mark) => mark.status === "PENDING").length;
    return {
      ...student,
      stats: {
        submitted,
        pending,
        total: marks.length,
      },
      statusFilter: pending > 0 ? "pending" : "submitted",
    };
  });
  const submittedCount = studentRows.reduce((count, student) => count + student.stats.submitted, 0);
  const pendingCount = studentRows.reduce((count, student) => count + student.stats.pending, 0);
  const submittedStudents = studentRows.filter((student) => student.statusFilter === "submitted").length;
  const pendingStudents = studentRows.filter((student) => student.statusFilter === "pending").length;
  const filteredRows =
    filter === "all" ? studentRows : studentRows.filter((student) => student.statusFilter === filter);
  const toggleStudentCard = (studentId) => {
    setExpandedStudents((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>View Marks</Text>
      <View style={styles.viewMarksTopRow}>
        <View style={[styles.dropdownWrap, styles.viewMarksTerminalWrap]}>
          <Text style={styles.inputLabel}>Terminal</Text>
          <Pressable
            onPress={() => setTerminalOpen((prev) => !prev)}
            style={[styles.input, styles.dropdownButton, terminalOpen && styles.dropdownButtonActive]}
          >
            <Text style={styles.dropdownButtonText}>{terminal || "Select terminal"}</Text>
            <Text style={styles.dropdownChevron}>{terminalOpen ? "^" : "v"}</Text>
          </Pressable>
          {terminalOpen ? (
            <View style={styles.dropdownMenu}>
              {terminals.map((item) => {
                const active = terminal === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setTerminal(item);
                      setTerminalOpen(false);
                    }}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

      </View>

      <View style={styles.dashboardCard}>
        <View style={styles.metricGrid}>
          <MetricCard label="Students" value={rows.length} tone="teal" />
          <MetricCard label="Submitted" value={submittedCount} tone="green" />
          <MetricCard label="Pending" value={pendingCount} tone="amber" />
          <MetricCard label="Visible" value={filteredRows.length} tone="red" />
        </View>
        <Text style={styles.dashboardHint}>Submitted ka matlab completed marks. Pending wale students me abhi kuch subjects baaki hain.</Text>
        <View style={styles.dashboardFilterRow}>
          {[
            { key: "all", label: "All" },
            { key: "submitted", label: "Submitted" },
            { key: "pending", label: "Pending" },
          ].map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[styles.dashboardFilterButton, active && styles.dashboardFilterButtonActive]}
              >
                <Text style={[styles.dashboardFilterText, active && styles.dashboardFilterTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.dashboardMetaRow}>
          <Text style={styles.dashboardMetaText}>Submitted Students: {submittedStudents}</Text>
          <Text style={styles.dashboardMetaText}>Pending Students: {pendingStudents}</Text>
        </View>
      </View>
      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label="Marks loading..." /> : null}

      {!loading && filteredRows.length ? (
        <View>
          <View style={[styles.list, styles.topGap]}>
            {filteredRows.map((student) => (
              <View key={student.student_id} style={styles.marksStudentCard}>
                <Pressable
                  onPress={() => toggleStudentCard(student.student_id)}
                  style={styles.marksStudentHeaderPressable}
                >
                  <View style={styles.recordRowHeader}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{student.name}</Text>
                      <Text style={styles.rowMeta}>Roll {student.roll_no} | Class {student.class} {student.section}</Text>
                    </View>
                    <View style={styles.marksCardStatusWrap}>
                      <Text style={styles.totalText}>Total {getStudentMarksTotal(student.marks)}</Text>
                      <StatusPill status={student.stats.pending > 0 ? "PENDING" : "SUBMITTED"} />
                    </View>
                  </View>
                </Pressable>
                {expandedStudents[student.student_id] ? (
                  <View style={styles.marksStudentDetails}>
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
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!loading && !rows.length ? (
        <EmptyState title="No marks found" text="Selected terminal ke liye marks records nahi mile." />
      ) : null}
      {!loading && rows.length && !filteredRows.length ? (
        <EmptyState title="No filtered marks" text="Is filter me koi student nahi mila. Dusra filter try karo." />
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
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [monthOpen, setMonthOpen] = useState(false);
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

  const records = detail?.records || [];
  const monthOptions = useMemo(() => {
    const months = Array.from(
      new Set(
        records
          .map((record) => String(record.attendance_date || "").slice(0, 7))
          .filter((month) => month && month.length === 7),
      ),
    ).sort((a, b) => b.localeCompare(a));

    return [{ key: "all", label: "All Months" }, ...months.map((month) => ({ key: month, label: formatMonthLabel(month) }))];
  }, [records]);

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("all");
      return;
    }

    setSelectedMonth((current) => (monthOptions.some((option) => option.key === current) ? current : monthOptions[0].key));
  }, [monthOptions]);

  const filteredRecords = useMemo(() => {
    if (selectedMonth === "all") return records;
    return records.filter((record) => String(record.attendance_date || "").slice(0, 7) === selectedMonth);
  }, [records, selectedMonth]);

  const monthlySummary = useMemo(() => {
    const map = new Map();
    records.forEach((record) => {
      const month = String(record.attendance_date || "").slice(0, 7);
      if (!month || month.length !== 7) return;
      if (!map.has(month)) {
        map.set(month, []);
      }
      map.get(month).push(record);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, monthRecords]) => {
        const monthSummary = summarizeRecords(monthRecords);
        const workingDays = monthSummary.present + monthSummary.absent + monthSummary.late;
        const percentage = workingDays ? Math.round(((monthSummary.present + monthSummary.late) / workingDays) * 100) : 0;

        return {
          key: month,
          label: formatMonthLabel(month),
          count: monthRecords.length,
          summary: monthSummary,
          percentage,
        };
      });
  }, [records]);

  const summary = summarizeRecords(filteredRecords);
  const workingDays = Number(summary?.workingDays || summary.present + summary.absent + summary.late || 0);
  const percentage = Number(summary?.percentage || (workingDays ? Math.round((summary.present / workingDays) * 100) : 0));
  const selectedMonthLabel =
    monthOptions.find((option) => option.key === selectedMonth)?.label || "All Months";

  return (
    <View>
      <Text style={styles.sectionTitle}>Student History</Text>
      {students.length ? (
        <StudentDropdown
          selectedStudentId={selectedStudentId}
          students={students}
          onSelect={(student) => setSelectedStudentId(student.id)}
        />
      ) : null}
      {records.length ? (
        <View style={styles.inlineField}>
          <Text style={styles.inputLabel}>Month</Text>
          <View style={styles.dropdownWrap}>
            <Pressable
              onPress={() => setMonthOpen((prev) => !prev)}
              style={[styles.input, styles.dropdownButton, monthOpen && styles.dropdownButtonActive]}
            >
              <Text style={styles.dropdownButtonText}>{selectedMonthLabel}</Text>
              <Text style={styles.dropdownChevron}>{monthOpen ? "^" : "v"}</Text>
            </Pressable>
            {monthOpen ? (
              <View style={styles.dropdownMenu}>
                {monthOptions.map((option) => {
                  const active = selectedMonth === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        setSelectedMonth(option.key);
                        setMonthOpen(false);
                      }}
                      style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                    >
                      <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
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
          {monthlySummary.length ? (
            <View style={[styles.dashboardCard, styles.topGap]}>
              <Text style={styles.sectionTitle}>Month Wise</Text>
              <View style={styles.monthBreakdownList}>
                {monthlySummary.map((row) => {
                  const active = selectedMonth === row.key;
                  return (
                    <Pressable
                      key={row.key}
                      onPress={() => setSelectedMonth(row.key)}
                      style={[styles.monthBreakdownItem, active && styles.monthBreakdownItemActive]}
                    >
                      <View style={styles.rowBody}>
                        <Text style={styles.monthBreakdownTitle}>{row.label}</Text>
                        <Text style={styles.monthBreakdownMeta}>
                          Records {row.count} | Present {row.summary.present || 0} | Absent {row.summary.absent || 0} | Late {row.summary.late || 0}
                        </Text>
                      </View>
                      <Text style={styles.monthBreakdownValue}>{row.percentage}%</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={styles.topGap}>
            <Text style={styles.sectionTitle}>{selectedMonth === "all" ? "All Records" : `${selectedMonthLabel} Records`}</Text>
            <RecordList records={filteredRecords} />
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
  const isStudent = session.role === "student";
  const monthOptions = useMemo(() => buildRecentMonthOptions(12), []);
  const { width } = useWindowDimensions();
  const isCompact = width < 520;
  const [month, setMonth] = useState(monthIso());
  const [monthOpen, setMonthOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("holidays");
  const [holidays, setHolidays] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const monthLabel = formatMonthLabel(month);

  useEffect(() => {
    if (isStudent && activeTab !== "holidays") {
      setActiveTab("holidays");
    }
  }, [activeTab, isStudent]);

  useEffect(() => {
    let cancelled = false;

    const loadPanelData = async () => {
      setLoading(true);
      setError("");

      try {
        if (activeTab === "leaveRequests" && !isStudent) {
          const response = await getStudentLeaveRequestsAdmin(session.token, { month });
          if (!cancelled) {
            setLeaveRequests(Array.isArray(response?.requests) ? response.requests : []);
          }
          return;
        }

        const response = await getHolidayCalendar(session.token, { month });
        if (!cancelled) {
          setHolidays(Array.isArray(response?.holidays) ? response.holidays : []);
        }
      } catch (err) {
        if (!cancelled) {
          if (activeTab === "leaveRequests" && !isStudent) {
            setLeaveRequests([]);
          } else {
            setHolidays([]);
          }
          setError(err.message || "Holiday calendar load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPanelData();

    return () => {
      cancelled = true;
    };
  }, [activeTab, isStudent, month, session.token]);

  const reviewLeaveRequest = async (requestId, status) => {
    if (!requestId) return;

    setSavingId(requestId);
    setError("");

    try {
      await reviewStudentLeaveRequest(session.token, requestId, { status });
      const response = await getStudentLeaveRequestsAdmin(session.token, { month });
      setLeaveRequests(Array.isArray(response?.requests) ? response.requests : []);
    } catch (err) {
      setError(err.message || "Leave request update failed");
    } finally {
      setSavingId("");
    }
  };

  const panelTitle = activeTab === "leaveRequests" && !isStudent ? "Leave Requests" : "Holiday Calendar";
  const panelInfoTitle =
    activeTab === "leaveRequests" && !isStudent
      ? "Pending leave requests are ready for review."
      : "Holidays are managed by the school admin.";
  const panelInfoSubtext =
    activeTab === "leaveRequests" && !isStudent
      ? "Month filter se selected month ke requests dikhenge."
      : "Fridays are automatically marked as weekly off.";

  return (
    <View style={styles.holidayScreen}>
      <View style={styles.holidayHeroCard}>
        <View style={styles.holidayHeroText}>
          <Text style={styles.holidayHeroEyebrow}>SCHOOL CALENDAR</Text>
          <Text style={[styles.holidayHeroTitle, isCompact && styles.holidayHeroTitleCompact]}>{panelTitle}</Text>
        </View>
        <View style={styles.holidayHeroArtWrap}>
          <Image source={bookIllustration} style={styles.holidayHeroArt} resizeMode="contain" />
        </View>
      </View>

      <View style={styles.holidayControlCard}>
        <Text style={styles.holidayFieldLabel}>MONTH</Text>
        <Pressable
          onPress={() => setMonthOpen((prev) => !prev)}
          style={[styles.holidayMonthButton, monthOpen && styles.holidayMonthButtonActive]}
        >
          <Text style={[styles.holidayMonthButtonText, isCompact && styles.holidayMonthButtonTextCompact]}>{monthLabel}</Text>
          <Feather name={monthOpen ? "chevron-up" : "chevron-down"} size={22} color="#5f6f86" />
        </Pressable>
        {monthOpen ? (
          <View style={[styles.dropdownMenu, styles.dropdownMenuScrollable, styles.holidayMonthMenu]}>
            {monthOptions.map((option) => {
              const active = month === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setMonth(option.value);
                    setMonthOpen(false);
                  }}
                  style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                >
                  <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{option.label}</Text>
                  <Text style={[styles.dropdownItemMeta, active && styles.dropdownItemMetaActive]}>{option.value}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!isStudent ? (
          <View style={styles.holidayTabSwitch}>
            <Pressable
              onPress={() => setActiveTab("holidays")}
              style={[styles.holidayTabButton, activeTab === "holidays" && styles.holidayTabButtonActive]}
            >
              <View style={styles.holidayTabButtonContent}>
                <View style={[styles.holidayTabIconWrap, activeTab === "holidays" && styles.holidayTabIconWrapActive]}>
                  <Feather name="calendar" size={16} color={activeTab === "holidays" ? "#fff" : "#64748b"} />
                </View>
                <Text style={[styles.holidayTabButtonText, activeTab === "holidays" && styles.holidayTabButtonTextActive]}>
                  Holidays
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("leaveRequests")}
              style={[styles.holidayTabButton, activeTab === "leaveRequests" && styles.holidayTabButtonActive]}
            >
              <View style={styles.holidayTabButtonContent}>
                <View style={[styles.holidayTabIconWrap, activeTab === "leaveRequests" && styles.holidayTabIconWrapActive]}>
                  <Feather name="file-text" size={16} color={activeTab === "leaveRequests" ? "#fff" : "#64748b"} />
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.holidayTabButtonText, activeTab === "leaveRequests" && styles.holidayTabButtonTextActive]}
                >
                  Leave Requests
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.holidayInfoCard}>
        <View style={styles.holidayInfoIconWrap}>
          <Feather name="info" size={18} color="#1458bf" />
        </View>
        <View style={styles.holidayInfoBody}>
          <Text style={styles.holidayInfoTitle}>{panelInfoTitle}</Text>
          <Text style={styles.holidayInfoSubtext}>{panelInfoSubtext}</Text>
        </View>
        <View style={styles.holidayInfoArtWrap}>
          <Feather name="bell" size={22} color="#9cc5ff" />
        </View>
      </View>

      {error ? <Notice tone="error" text={error} /> : null}
      {loading ? <LoadingBlock label={activeTab === "leaveRequests" && !isStudent ? "Leave requests loading..." : "Holidays loading..."} /> : null}

      {!loading && activeTab === "leaveRequests" && !isStudent ? (
        leaveRequests.length ? (
          <View style={styles.list}>
            {leaveRequests.map((request) => {
              const student = request.student || {};
              const dateText =
                request.from_date === request.to_date
                  ? formatDisplayDate(request.from_date)
                  : `${formatDisplayDate(request.from_date)} to ${formatDisplayDate(request.to_date)}`;
              const status = String(request.status || "pending").toLowerCase();
              const isPending = status === "pending";

              return (
                <View key={request.id} style={styles.leaveReviewCard}>
                  <View style={[styles.leaveReviewHeader, isCompact && styles.leaveReviewHeaderStacked]}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{student.name || `Roll ${request.roll_no || "-"}`}</Text>
                      <Text style={styles.rowMeta}>
                        Class {request.class || "-"} {request.section || ""} | Roll {request.roll_no || "-"}
                      </Text>
                      <Text style={styles.rowSub}>{request.leave_type || "Leave"} | {dateText}</Text>
                      <Text style={styles.rowSub}>{request.reason}</Text>
                      {request.admin_remarks ? <Text style={styles.rowSub}>Remarks: {request.admin_remarks}</Text> : null}
                    </View>
                    <StatusPill status={request.status} />
                  </View>

                  {isPending ? (
                    <View style={[styles.leaveReviewActions, isCompact && styles.leaveReviewActionsStacked]}>
                      <Pressable
                        disabled={savingId === request.id}
                        onPress={() => reviewLeaveRequest(request.id, "approved")}
                        style={[
                          styles.leaveReviewButton,
                          isCompact && styles.leaveReviewButtonStacked,
                          styles.leaveReviewApprove,
                          savingId === request.id && styles.disabledButton,
                        ]}
                      >
                        <Text style={styles.leaveReviewButtonText}>Approve</Text>
                      </Pressable>
                      <Pressable
                        disabled={savingId === request.id}
                        onPress={() => reviewLeaveRequest(request.id, "rejected")}
                        style={[
                          styles.leaveReviewButton,
                          isCompact && styles.leaveReviewButtonStacked,
                          styles.leaveReviewReject,
                          savingId === request.id && styles.disabledButton,
                        ]}
                      >
                        <Text style={styles.leaveReviewButtonText}>Reject</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.leaveReviewFooterText}>
                      Decided on {request.decided_at ? formatProfileDate(request.decided_at) : "-"}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState title="No leave requests" text="Selected month me koi leave request nahi mili." />
        )
      ) : null}

      {!loading && (activeTab === "holidays" || isStudent) ? (
        holidays.length ? (
          <View style={styles.list}>
            {holidays.map((holiday, index) => {
              const startDate = holiday.start_date || holiday.holiday_date;
              const endDate = holiday.end_date || holiday.holiday_date;
              const dateText =
                startDate === endDate ? formatDisplayDate(startDate) : `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
              const badgeParts = getHolidayBadgeParts(startDate);
              const decorIcon = getHolidayDecorIcon(index, holiday.type);
              const chipText = holiday.type === "weekly" ? "Friday" : "Admin";
              return (
                <View key={holiday.id || `${startDate}-${holiday.title}`} style={styles.holidayItemCard}>
                  <View style={styles.holidayDateBadge}>
                    <Text style={styles.holidayDateWeekday}>{badgeParts.weekday}</Text>
                    <Text style={styles.holidayDateDay}>{badgeParts.day}</Text>
                    <Text style={styles.holidayDateMonth}>{badgeParts.month}</Text>
                  </View>
                  <View style={styles.holidayItemDivider} />
                  <View style={styles.holidayItemBody}>
                    <Text style={styles.holidayItemTitle}>{holiday.title || "Holiday"}</Text>
                    <Text style={styles.holidayItemDate}>{dateText}</Text>
                    <Text style={styles.holidayItemSub}>{holiday.description || "Weekly Friday holiday"}</Text>
                  </View>
                  <View style={styles.holidayItemMeta}>
                    <View style={styles.holidayTypeChip}>
                      <Text style={styles.holidayTypeText}>{chipText}</Text>
                    </View>
                    <View style={styles.holidayIconTile}>
                      <Feather name={decorIcon} size={24} color="#1458bf" />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState title="No holidays" text="Selected month me holiday records nahi mile." />
        )
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

function StudentDropdown({ selectedStudentId, students, onSelect }) {
  const [open, setOpen] = useState(false);

  if (!students.length) {
    return <EmptyState title="No students" text="Marks submit karne ke liye students load nahi hue." />;
  }

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || students[0];
  const selectedClassText = selectedStudent?.class
    ? `Class ${selectedStudent.class}${selectedStudent.section ? `-${selectedStudent.section}` : ""}`
    : "Class -";

  return (
    <View style={styles.inlineField}>
      <Text style={styles.inputLabel}>Student</Text>
      <View style={styles.studentAccordionCard}>
        <Pressable onPress={() => setOpen((prev) => !prev)} style={[styles.studentAccordionHeader, open && styles.studentAccordionHeaderActive]}>
          <View style={styles.studentAccordionBody}>
            <Text style={styles.studentAccordionTitle}>{selectedStudent?.name || "Select student"}</Text>
            <Text style={styles.studentAccordionSubtext}>
              Roll {selectedStudent?.rollNo || "-"} | {selectedClassText}
            </Text>
          </View>
          <View style={styles.studentAccordionBadge}>
            <Text style={styles.studentAccordionBadgeText}>{open ? "Close" : "Open"}</Text>
            <Text style={styles.dropdownChevron}>{open ? "^" : "v"}</Text>
          </View>
        </Pressable>
        {open ? (
          <View style={[styles.dropdownMenu, styles.dropdownMenuScrollable, styles.studentAccordionMenu]}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {students.map((student) => {
                const active = selectedStudentId === student.id;
                return (
                  <Pressable
                    key={student.id}
                    onPress={() => {
                      onSelect(student);
                      setOpen(false);
                    }}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                      {student.name || "Student"}
                    </Text>
                    <Text style={[styles.dropdownItemMeta, active && styles.dropdownItemMetaActive]}>
                      Roll {student.rollNo || "-"}
                      {student.class ? ` | Class ${student.class}${student.section ? `-${student.section}` : ""}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MetricCard({ label, value, tone }) {
  const iconName = getMetricIconName(label);
  const iconColor = getMetricIconColor(tone);

  return (
    <View style={[styles.metricCard, styles[`metric_${tone}`]]}>
      <View style={styles.metricIconWrap}>
        <Feather name={iconName} size={20} color={iconColor} />
      </View>
      <View style={styles.metricBody}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
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
  const textStyle = tone === "error" ? styles.noticeTextError : tone === "success" ? styles.noticeTextSuccess : styles.noticeTextInfo;
  const iconName = getNoticeIconName(tone);
  const iconColor = tone === "error" ? "#9f2f21" : tone === "success" ? "#166534" : "#1458bf";

  return (
    <View style={[styles.notice, toneStyle]}>
      <View style={styles.noticeContentRow}>
        <Feather name={iconName} size={18} color={iconColor} />
        <Text style={[styles.noticeText, textStyle]}>{text}</Text>
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

const getMetricIconName = (label = "") => {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("attendance")) return "pie-chart";
  if (normalized.includes("present")) return "user-check";
  if (normalized.includes("absent")) return "user-x";
  if (normalized.includes("late")) return "clock";
  if (normalized.includes("check in")) return "log-in";
  if (normalized.includes("check out")) return "log-out";
  if (normalized.includes("work")) return "clock";
  if (normalized.includes("distance")) return "map-pin";
  if (normalized.includes("leave")) return "file-text";
  if (normalized.includes("working")) return "calendar";
  if (normalized.includes("record")) return "layers";
  if (normalized.includes("obtained")) return "check-circle";
  if (normalized.includes("percent")) return "percent";
  if (normalized.includes("division")) return "shield";
  if (normalized.includes("total")) return "bar-chart-2";
  if (normalized.includes("students")) return "users";
  return "grid";
};

const getMetricIconColor = (tone = "") =>
  ({
    teal: "#1458bf",
    green: "#16a34a",
    red: "#ef4444",
    amber: "#f59e0b",
  }[tone] || "#1458bf");

const getNoticeIconName = (tone = "info") =>
  tone === "error" ? "alert-circle" : tone === "success" ? "check-circle" : "info";

const HOLIDAY_DECOR_ICONS = ["umbrella", "sun", "glasses", "camera"];

const getHolidayBadgeParts = (dateValue) => {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return { weekday: "--", day: "--", month: "---" };
  }

  return {
    weekday: parsed
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase(),
    day: parsed.toLocaleDateString("en-US", { day: "2-digit" }),
    month: parsed
      .toLocaleDateString("en-US", { month: "short" })
      .toUpperCase(),
  };
};

const getHolidayDecorIcon = (index = 0, type = "") =>
  String(type || "").toLowerCase() === "weekly"
    ? HOLIDAY_DECOR_ICONS[index % HOLIDAY_DECOR_ICONS.length]
    : "calendar";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7fb",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  centerScreen: {
    alignItems: "center",
    backgroundColor: "#f5f7fb",
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
    backgroundColor: "#f5f7fb",
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
    color: "#1d4ed8",
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
    backgroundColor: "#eff6ff",
  },
  segmentText: {
    color: "#52606d",
    fontSize: 14,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: "#1d4ed8",
  },
  formBlock: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  inputLabel: {
    color: "#0d2f68",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginBottom: 7,
    marginTop: 10,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#dde6f2",
    borderRadius: 16,
    borderWidth: 1,
    color: "#17202a",
    fontSize: 14,
    fontWeight: "700",
    minHeight: 54,
    paddingHorizontal: 15,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  helperText: {
    color: "#5b6470",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
  },
  readOnlyInput: {
    backgroundColor: "#f3f4f6",
    color: "#475569",
  },
  dropdownWrap: {
    position: "relative",
    zIndex: 30,
  },
  dropdownButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingRight: 14,
  },
  dropdownButtonActive: {
    borderColor: "#1458bf",
  },
  dropdownButtonText: {
    color: "#17202a",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    paddingRight: 10,
  },
  dropdownChevron: {
    color: "#6c7d97",
    fontSize: 14,
    fontWeight: "900",
  },
  dropdownMenu: {
    backgroundColor: "#fff",
    borderColor: "#dde6f2",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 8,
    marginTop: 6,
    overflow: "hidden",
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownItemActive: {
    backgroundColor: "#edf4ff",
  },
  dropdownItemText: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "700",
  },
  dropdownItemTextActive: {
    color: "#1d4ed8",
  },
  dropdownItemMeta: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  dropdownItemMetaActive: {
    color: "#5b6bff",
  },
  dropdownMenuScrollable: {
    maxHeight: 240,
  },
  studentAccordionCard: {
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 2,
    overflow: "hidden",
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  studentAccordionHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  studentAccordionHeaderActive: {
    backgroundColor: "#f7faff",
    borderBottomColor: "#e3ebf5",
    borderBottomWidth: 1,
  },
  studentAccordionBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  studentAccordionTitle: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "900",
  },
  studentAccordionSubtext: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  studentAccordionBadge: {
    alignItems: "flex-end",
    minWidth: 48,
  },
  studentAccordionBadgeText: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  studentAccordionMenu: {
    borderColor: "#e2e8f0",
    borderRadius: 0,
    borderWidth: 0,
    marginTop: 0,
  },
  viewMarksTopRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  viewMarksTerminalWrap: {
    flex: 1,
    minWidth: 0,
    zIndex: 20,
  },
  dashboardCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 10,
    padding: 16,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  dashboardHint: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 10,
  },
  monthBreakdownList: {
    gap: 8,
    marginTop: 10,
  },
  monthBreakdownItem: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  monthBreakdownItemActive: {
    backgroundColor: "#edf4ff",
    borderColor: "#1458bf",
  },
  monthBreakdownTitle: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "900",
  },
  monthBreakdownMeta: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  monthBreakdownValue: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "900",
    minWidth: 42,
    textAlign: "right",
  },
  dashboardFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  dashboardFilterButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dfe7f2",
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 10,
  },
  dashboardFilterButtonActive: {
    backgroundColor: "#edf4ff",
    borderColor: "#1458bf",
  },
  dashboardFilterText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
  },
  dashboardFilterTextActive: {
    color: "#1d4ed8",
  },
  dashboardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  dashboardMetaText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#1458bf",
    borderRadius: 18,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 56,
    shadowColor: "#1458bf",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  buttonContentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  inlineTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  actionButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 18,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 14,
  },
  actionButtonSoft: {
    backgroundColor: "#edf4ff",
    borderColor: "#c9daf7",
    borderWidth: 1,
  },
  actionButtonPrimary: {
    backgroundColor: "#1458bf",
    borderColor: "#1458bf",
    borderWidth: 1,
    shadowColor: "#1458bf",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  actionButtonText: {
    color: "#1458bf",
    fontSize: 15,
    fontWeight: "900",
  },
  actionButtonTextPrimary: {
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
  profileButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: "#0f5f63",
    borderColor: "#0b474a",
    borderRadius: 999,
    borderWidth: 2,
    height: 42,
    overflow: "hidden",
    justifyContent: "center",
    width: 42,
  },
  profileAvatarImage: {
    height: "100%",
    width: "100%",
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
  profilePageShell: {
    backgroundColor: "#fffdf7",
    borderColor: "#e0d5b6",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  profilePageTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  profileBackButton: {
    alignItems: "center",
    backgroundColor: "#0f5f63",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  profileBackButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  profilePageKicker: {
    color: "#9a6c1c",
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
    textTransform: "uppercase",
  },
  profilePageSpacer: {
    width: 58,
  },
  profileHeroCard: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#d9e2ec",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  profileHeroAvatar: {
    alignItems: "center",
    backgroundColor: "#0f5f63",
    borderRadius: 20,
    height: 68,
    overflow: "hidden",
    justifyContent: "center",
    width: 68,
  },
  profileHeroAvatarImage: {
    height: "100%",
    width: "100%",
  },
  profileHeroText: {
    flex: 1,
    minWidth: 0,
  },
  profileHeroName: {
    color: "#152238",
    fontSize: 23,
    fontWeight: "900",
  },
  profileHeroMeta: {
    color: "#52606d",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  profileHeroSubMeta: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  profileGrid: {
    gap: 12,
    marginTop: 12,
  },
  profileSectionCard: {
    backgroundColor: "#fff",
    borderColor: "#dde6ef",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    padding: 12,
  },
  profileSectionTitle: {
    color: "#9a6c1c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  profileFieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  profileFieldCard: {
    backgroundColor: "#f8fbff",
    borderColor: "#e6edf5",
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileModalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(7, 15, 25, 0.56)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  profileModalCard: {
    backgroundColor: "#fffdf7",
    borderColor: "#d8c9a5",
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: "84%",
    padding: 16,
    width: "100%",
  },
  profileModalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  profileModalAvatar: {
    alignItems: "center",
    backgroundColor: "#0f5f63",
    borderRadius: 18,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  profileModalAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  profileModalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  profileModalEyebrow: {
    color: "#9a6c1c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  profileModalName: {
    color: "#152238",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  profileModalMeta: {
    color: "#52606d",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  profileCloseButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d6dbe2",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  profileCloseButtonText: {
    color: "#334155",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 18,
  },
  profileModalBody: {
    paddingBottom: 10,
    paddingTop: 14,
  },
  profileDetailRow: {
    borderBottomColor: "#eef1f5",
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  profileDetailLabel: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  profileDetailValue: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  profileLogoutButton: {
    alignItems: "center",
    marginTop: 10,
  },
  profileMenuCard: {
    backgroundColor: "#fff",
    borderColor: "#dbe3eb",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  profileMenuTitle: {
    color: "#0f5f63",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  profileMenuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  profileMenuButton: {
    alignItems: "center",
    backgroundColor: "#eef5ff",
    borderColor: "#d8e6fb",
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "30%",
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  profileMenuButtonText: {
    color: "#174ea6",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  legalShell: {
    backgroundColor: "#eef4fb",
    flexGrow: 1,
    padding: 16,
  },
  legalCard: {
    backgroundColor: "#fff",
    borderColor: "#d8e3ef",
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  legalHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  legalBackButton: {
    alignItems: "center",
    backgroundColor: "#0f5f63",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  legalBackButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  legalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  legalKicker: {
    color: "#9a6c1c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  legalTitle: {
    color: "#152238",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  legalIntro: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 14,
  },
  legalPoints: {
    gap: 10,
    marginTop: 14,
  },
  legalPointRow: {
    flexDirection: "row",
    gap: 10,
  },
  legalPointBullet: {
    color: "#0f5f63",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    width: 14,
  },
  legalPointText: {
    color: "#1f2937",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  legalContactCard: {
    backgroundColor: "#f7fbff",
    borderColor: "#dce8f4",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  legalSectionTitle: {
    color: "#0f5f63",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  legalContactText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 4,
  },
  legalButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  legalActionButton: {
    alignItems: "center",
    backgroundColor: "#eef5ff",
    borderColor: "#d7e4f6",
    borderRadius: 999,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "30%",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  legalActionButtonText: {
    color: "#174ea6",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  legalFooterCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#e5ebf2",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  legalFooterText: {
    color: "#5b6572",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  content: {
    padding: 16,
    paddingBottom: 180,
  },
  tabDock: {
    backgroundColor: "rgba(250, 248, 244, 0.98)",
    borderColor: "#e3ddd2",
    borderRadius: 22,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    paddingBottom: 8,
    paddingTop: 8,
    position: "absolute",
    right: 12,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  parentTabScroller: {
    paddingHorizontal: 8,
  },
  parentTabBar: {
    flexDirection: "row",
    gap: 7,
  },
  parentTabButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    flex: 1,
    flexBasis: 0,
    minHeight: 70,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  parentTabButtonActive: {
    backgroundColor: "#f8fbff",
    borderColor: "#3b82f6",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  parentTabText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  parentTabTextActive: {
    color: "#1d4ed8",
  },
  parentTabBadge: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    marginBottom: 6,
    width: 26,
  },
  parentTabBadgeActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#bfdbfe",
  },
  parentTabBadgeText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
  },
  parentTabBadgeTextActive: {
    color: "#1d4ed8",
  },
  sectionTabsWrap: {
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 1,
    marginBottom: 12,
    paddingBottom: 10,
  },
  sectionTabsScroller: {
    marginHorizontal: -4,
  },
  sectionTabsBar: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 4,
  },
  sectionTabButton: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  sectionTabButtonActive: {
    borderBottomColor: "#4f46e5",
  },
  sectionTabIcon: {
    borderColor: "#8a8f98",
    borderRadius: 2,
    borderWidth: 1.4,
    height: 12,
    width: 12,
  },
  sectionTabIconActive: {
    borderColor: "#4f46e5",
  },
  sectionTabText: {
    color: "#8a8f98",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionTabTextActive: {
    color: "#4f46e5",
  },
  loadingBlock: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },
  heroPanel: {
    backgroundColor: "#08377e",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#0d4ca9",
    marginBottom: 14,
    overflow: "hidden",
    padding: 20,
    shadowColor: "#08377e",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  heroBrandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  heroLogoWrap: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  heroLogo: {
    height: 44,
    width: 44,
  },
  panelEyebrow: {
    color: "#ffd15c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  panelSubEyebrow: {
    color: "#dbe7ff",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
    marginTop: 14,
  },
  panelMeta: {
    color: "#dbe7ff",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 6,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  homeSectionCard: {
    marginTop: 18,
  },
  metricCard: {
    alignItems: "center",
    borderColor: "#edf2fa",
    flexDirection: "row",
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    minHeight: 102,
    padding: 16,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    width: "48%",
  },
  metric_teal: {
    backgroundColor: "#edf4ff",
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
    color: "#5f6f86",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#0b2f63",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 10,
  },
  metricIconWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.66)",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  metricBody: {
    flex: 1,
    justifyContent: "center",
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
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 78,
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  featureIconText: {
    color: "#1d4ed8",
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
  list: {
    gap: 10,
  },
  topGap: {
    marginTop: 12,
  },
  rowCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#edf4ff",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: "#1458bf",
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
  holidayScreen: {
    gap: 14,
  },
  holidayHeroCard: {
    alignItems: "center",
    backgroundColor: "#f6f9ff",
    borderColor: "#dbe5f2",
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 132,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
  },
  holidayHeroText: {
    flex: 1,
    minWidth: 0,
  },
  holidayHeroEyebrow: {
    color: "#6b7a91",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  holidayHeroTitle: {
    color: "#15294f",
    fontSize: 33,
    fontWeight: "900",
    lineHeight: 40,
  },
  holidayHeroTitleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  holidayHeroArtWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
    borderRadius: 24,
    justifyContent: "center",
    minHeight: 96,
    minWidth: 96,
    padding: 10,
  },
  holidayHeroArt: {
    height: 82,
    width: 82,
  },
  holidayControlCard: {
    backgroundColor: "#fff",
    borderColor: "#dbe5f2",
    borderRadius: 34,
    borderWidth: 1,
    gap: 12,
    padding: 18,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
  },
  holidayFieldLabel: {
    color: "#6b7a91",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  holidayMonthButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d6e0ef",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: 18,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  holidayMonthButtonActive: {
    borderColor: "#bcd0f4",
  },
  holidayMonthButtonText: {
    color: "#15294f",
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    paddingRight: 12,
  },
  holidayMonthButtonTextCompact: {
    fontSize: 17,
  },
  holidayTabButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  holidayTabIconWrap: {
    alignItems: "center",
    backgroundColor: "#eef4ff",
    borderRadius: 12,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  holidayTabIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  holidayInfoCard: {
    alignItems: "center",
    backgroundColor: "#f7fbff",
    borderColor: "#cfe0f7",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 86,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  holidayInfoIconWrap: {
    alignItems: "center",
    backgroundColor: "#ddebff",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  holidayInfoBody: {
    flex: 1,
    minWidth: 0,
  },
  holidayInfoTitle: {
    color: "#1f2f4d",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 21,
  },
  holidayInfoSubtext: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
  holidayInfoArtWrap: {
    alignItems: "center",
    backgroundColor: "#eef4ff",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  holidayItemCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe4f3",
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  holidayDateBadge: {
    alignItems: "center",
    backgroundColor: "#f3f7fd",
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 112,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: 86,
  },
  holidayDateWeekday: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  holidayDateDay: {
    color: "#15294f",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38,
    marginTop: 2,
  },
  holidayDateMonth: {
    color: "#6b7a91",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  holidayItemDivider: {
    alignSelf: "stretch",
    backgroundColor: "#dbe5f2",
    borderRadius: 999,
    width: 1,
  },
  holidayItemBody: {
    flex: 1,
    minWidth: 0,
  },
  holidayItemTitle: {
    color: "#15294f",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24,
  },
  holidayItemDate: {
    color: "#1458bf",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },
  holidayItemSub: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  holidayItemMeta: {
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
  },
  holidayTypeChip: {
    backgroundColor: "#eef4ff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  holidayIconTile: {
    alignItems: "center",
    backgroundColor: "#eff4ff",
    borderRadius: 22,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  holidayCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
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
  holidayToolbar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  holidayToolbarStacked: {
    flexDirection: "column",
  },
  holidayMonthField: {
    flex: 1,
  },
  holidayMonthFieldStacked: {
    width: "100%",
  },
  holidayMonthFieldOpen: {
    paddingBottom: 0,
  },
  holidayTabSwitch: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
  },
  holidayTabSwitchStacked: {
    flexDirection: "row",
    width: "100%",
  },
  holidayTabButton: {
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderColor: "#dbe4f0",
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  holidayTabButtonCompact: {
    borderRadius: 16,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  holidayTabButtonActive: {
    backgroundColor: "#1458bf",
    borderColor: "#1458bf",
    shadowColor: "#1458bf",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  holidayTabButtonText: {
    color: "#52606d",
    fontSize: 13,
    fontWeight: "900",
  },
  holidayTabButtonTextCompact: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  holidayTabButtonTextActive: {
    color: "#fff",
  },
  holidayMonthMenu: {
    marginTop: 10,
  },
  leaveReviewCard: {
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  leaveReviewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  leaveReviewHeaderStacked: {
    flexDirection: "column",
  },
  leaveReviewActions: {
    flexDirection: "row",
    gap: 10,
  },
  leaveReviewActionsStacked: {
    flexDirection: "column",
  },
  leaveReviewButton: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leaveReviewButtonStacked: {
    flex: 0,
    width: "100%",
  },
  leaveReviewApprove: {
    backgroundColor: "#0f766e",
  },
  leaveReviewReject: {
    backgroundColor: "#b91c1c",
  },
  leaveReviewButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  leaveReviewFooterText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
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
    borderColor: "#dbe4f0",
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 54,
    minWidth: 78,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  terminalButtonActive: {
    backgroundColor: "#1458bf",
    borderColor: "#1458bf",
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
  studentChip: {
    backgroundColor: "#fff",
    borderColor: "#dbe4f0",
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 136,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  studentChipActive: {
    backgroundColor: "#1458bf",
    borderColor: "#1458bf",
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
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  attendanceHeader: {
    marginBottom: 10,
  },
  marksCard: {
    backgroundColor: "#fff",
    borderColor: "#e3ebf5",
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 10,
    padding: 16,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
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
  marksStudentHeaderPressable: {
    borderRadius: 8,
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
  marksCardStatusWrap: {
    alignItems: "flex-end",
    gap: 6,
  },
  marksStudentDetails: {
    paddingTop: 6,
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
    backgroundColor: "#ffffff",
    borderColor: "#dfe7f2",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  statusButtonActive: {
    backgroundColor: "#1458bf",
    borderColor: "#1458bf",
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
    borderColor: "#e3ebf5",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  recordRowActive: {
    backgroundColor: "#edf4ff",
    borderColor: "#1458bf",
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
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  noticeError: {
    backgroundColor: "#fff3f1",
    borderColor: "#f4c2ba",
  },
  noticeInfo: {
    backgroundColor: "#eef7ff",
    borderColor: "#c9defa",
  },
  noticeSuccess: {
    backgroundColor: "#effcf3",
    borderColor: "#a6e4b9",
  },
  noticeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  noticeTextError: {
    color: "#9f2f21",
  },
  noticeTextInfo: {
    color: "#17305d",
  },
  noticeTextSuccess: {
    color: "#166534",
  },
  noticeContentRow: {
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
  portalShell: {
    flex: 1,
    backgroundColor: "#07366f",
  },
  portalContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  portalFrame: {
    alignSelf: "center",
    backgroundColor: "#07366f",
    flex: 1,
    maxWidth: 430,
    minHeight: 812,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  portalPhotoLayer: {
    backgroundColor: "#dceefa",
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    height: 202,
    left: 0,
    opacity: 0.96,
    position: "absolute",
    right: 0,
    top: 0,
  },
  portalWhiteSheet: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomLeftRadius: 76,
    borderBottomRightRadius: 76,
    borderTopLeftRadius: 260,
    borderTopRightRadius: 260,
    bottom: 96,
    left: -54,
    position: "absolute",
    right: -54,
    top: 158,
  },
  portalGoldArc: {
    borderColor: "#efc44d",
    borderRadius: 270,
    borderWidth: 3,
    bottom: 86,
    height: 560,
    left: -86,
    opacity: 0.78,
    position: "absolute",
    right: -86,
  },
  portalHero: {
    alignItems: "center",
    paddingBottom: 8,
    paddingHorizontal: 28,
    paddingTop: 44,
    zIndex: 2,
  },
  portalLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  portalLogoGlow: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderRadius: 999,
    height: 134,
    position: "absolute",
    width: 134,
  },
  portalLogoRing: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#efc44d",
    borderRadius: 999,
    borderWidth: 2,
    elevation: 6,
    height: 112,
    justifyContent: "center",
    shadowColor: "#d69c18",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    width: 112,
  },
  portalLogoImage: {
    height: 100,
    width: 100,
  },
  portalEyebrowRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  portalTinyLine: {
    backgroundColor: "#d9a62e",
    borderRadius: 999,
    height: 1.5,
    width: 26,
  },
  portalEyebrow: {
    color: "#1458bf",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  portalTitle: {
    color: "#092d66",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32,
    marginTop: 5,
    textAlign: "center",
  },
  portalSubtitle: {
    color: "#56657f",
    fontSize: 13.5,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  portalDivider: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 7,
  },
  portalDividerLine: {
    backgroundColor: "#d9a62e",
    borderRadius: 999,
    height: 1.5,
    width: 42,
  },
  portalDividerStar: {
    color: "#d9a62e",
    fontSize: 16,
    fontWeight: "900",
  },
  portalFeatureRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 14,
    width: "100%",
  },
  portalFeatureCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e0e7f1",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 3,
    flex: 1,
    justifyContent: "center",
    minHeight: 82,
    paddingHorizontal: 6,
    paddingVertical: 10,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  portalFeatureIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  portalFeatureIconBlue: {
    backgroundColor: "#eaf1ff",
  },
  portalFeatureIconGreen: {
    backgroundColor: "#e9f8ef",
  },
  portalFeatureIconGold: {
    backgroundColor: "#fff2df",
  },
  portalFeatureIconText: {
    color: "#1458bf",
    fontSize: 15,
    fontWeight: "900",
  },
  portalFeatureTitle: {
    color: "#092d66",
    fontSize: 13.5,
    fontWeight: "900",
    marginTop: 5,
    textAlign: "center",
  },
  portalFeatureText: {
    color: "#65758d",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  portalSegment: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderColor: "#e4ebf3",
    borderRadius: 22,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    height: 42,
    marginTop: 8,
    padding: 4,
    position: "relative",
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    width: "86%",
    zIndex: 3,
  },
  portalSegmentThumb: {
    backgroundColor: "#073b82",
    borderRadius: 18,
    bottom: 4,
    left: 4,
    position: "absolute",
    top: 4,
    width: "50%",
  },
  portalSegmentThumbRight: {
    left: "50%",
  },
  portalSegmentButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    zIndex: 1,
  },
  portalSegmentText: {
    color: "#092d66",
    fontSize: 15,
    fontWeight: "900",
  },
  portalSegmentTextActive: {
    color: "#fff",
  },
  portalFormCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    elevation: 4,
    marginHorizontal: 28,
    marginTop: 9,
    paddingBottom: 13,
    paddingHorizontal: 20,
    paddingTop: 13,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    zIndex: 2,
  },
  portalFormTitle: {
    color: "#092d66",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  portalFormSubtitle: {
    color: "#607087",
    fontSize: 12.5,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 3,
    textAlign: "center",
  },
  portalLabel: {
    color: "#092d66",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 5,
    marginTop: 5,
    textTransform: "uppercase",
  },
  portalInputShell: {
    alignItems: "center",
    backgroundColor: "#fbfdff",
    borderColor: "#dbe4f0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    height: 46,
    overflow: "hidden",
  },
  portalInputIcon: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#f1f6fb",
    borderRightColor: "#e0e8f2",
    borderRightWidth: 1,
    justifyContent: "center",
    width: 46,
  },
  portalInputIconText: {
    color: "#0f4592",
    fontSize: 14,
    fontWeight: "900",
  },
  portalInput: {
    color: "#10233f",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  portalEyeButton: {
    paddingHorizontal: 12,
  },
  portalEyeText: {
    color: "#7a879a",
    fontSize: 11,
    fontWeight: "900",
  },
  portalHelperText: {
    color: "#5b6470",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 6,
  },
  portalErrorText: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 7,
  },
  portalOptionsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 9,
    marginTop: 10,
  },
  portalRememberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  portalCheckBox: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#b8c6d8",
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  portalCheckBoxActive: {
    backgroundColor: "#073b82",
    borderColor: "#073b82",
  },
  portalCheckText: {
    color: "transparent",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 11,
  },
  portalRememberText: {
    color: "#65758d",
    fontSize: 12,
    fontWeight: "700",
  },
  portalForgotText: {
    color: "#1458bf",
    fontSize: 12,
    fontWeight: "800",
  },
  portalConsentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  portalConsentBox: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#b8c6d8",
    borderRadius: 6,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  portalConsentBoxActive: {
    backgroundColor: "#073b82",
    borderColor: "#073b82",
  },
  portalConsentCheck: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 11,
  },
  portalConsentText: {
    color: "#304255",
    flex: 1,
    flexWrap: "wrap",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  portalLegalLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 12,
  },
  portalLegalLinkButton: {
    backgroundColor: "#edf3fb",
    borderColor: "#d8e4f3",
    borderRadius: 999,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  portalLegalLinkText: {
    color: "#124a9f",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  portalLoginButton: {
    alignItems: "center",
    backgroundColor: "#073b82",
    borderRadius: 999,
    elevation: 5,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 46,
    shadowColor: "#073b82",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  portalLoginText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  portalOrRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    marginTop: 8,
  },
  portalOrLine: {
    backgroundColor: "#e4c46b",
    flex: 1,
    height: 1,
  },
  portalOrBubble: {
    alignItems: "center",
    backgroundColor: "#fff7df",
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  portalOrText: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "900",
  },
  portalAdminButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#9db1d1",
    borderRadius: 999,
    borderWidth: 1.2,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 40,
  },
  portalAdminText: {
    color: "#0b397b",
    fontSize: 14,
    fontWeight: "900",
  },
  portalFooter: {
    alignItems: "center",
    bottom: 16,
    left: 24,
    position: "absolute",
    right: 24,
    zIndex: 2,
  },
  portalFooterText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
  portalFooterAuthor: {
    color: "#efc44d",
    fontSize: 12.5,
    fontWeight: "900",
    marginTop: 3,
  },
  portalFrame: {
    alignSelf: "center",
    backgroundColor: "#07366f",
    flex: 1,
    maxWidth: 430,
    minHeight: 780,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  portalPhotoLayer: {
    backgroundColor: "#dceefa",
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    height: 156,
    left: 0,
    opacity: 0.96,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  portalPhotoImage: {
    height: 300,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
  },
  portalPhotoWash: {
    backgroundColor: "rgba(255,255,255,0.35)",
    flex: 1,
    zIndex: 1,
  },
  portalWhiteSheet: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomLeftRadius: 64,
    borderBottomRightRadius: 64,
    borderTopLeftRadius: 260,
    borderTopRightRadius: 260,
    bottom: 76,
    left: -54,
    position: "absolute",
    right: -54,
    top: 118,
  },
  portalGoldArc: {
    borderColor: "#efc44d",
    borderRadius: 270,
    borderWidth: 2,
    bottom: 68,
    height: 470,
    left: -86,
    opacity: 0.78,
    position: "absolute",
    right: -86,
  },
  portalHero: {
    alignItems: "center",
    paddingBottom: 6,
    paddingHorizontal: 34,
    paddingTop: 32,
    zIndex: 2,
  },
  portalLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  portalLogoGlow: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderRadius: 999,
    height: 112,
    position: "absolute",
    width: 112,
  },
  portalLogoRing: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#efc44d",
    borderRadius: 999,
    borderWidth: 2,
    elevation: 6,
    height: 92,
    justifyContent: "center",
    shadowColor: "#d69c18",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    width: 92,
  },
  portalLogoImage: {
    height: 82,
    width: 82,
  },
  portalEyebrowRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  portalTinyLine: {
    backgroundColor: "#d9a62e",
    borderRadius: 999,
    height: 1.5,
    width: 22,
  },
  portalEyebrow: {
    color: "#1458bf",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  portalTitle: {
    color: "#092d66",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 27,
    marginTop: 4,
    textAlign: "center",
  },
  portalSubtitle: {
    color: "#56657f",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  portalDivider: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  portalDividerLine: {
    backgroundColor: "#d9a62e",
    borderRadius: 999,
    height: 1,
    width: 34,
  },
  portalDividerStar: {
    color: "#d9a62e",
    fontSize: 12,
    fontWeight: "900",
  },
  portalFeatureRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    width: "100%",
  },
  portalFeatureCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e0e7f1",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 3,
    flex: 1,
    justifyContent: "center",
    minHeight: 74,
    paddingHorizontal: 5,
    paddingVertical: 8,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  portalFeatureIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  portalFeatureIconText: {
    color: "#1458bf",
    fontSize: 12,
    fontWeight: "900",
  },
  portalFeatureIconImage: {
    height: 17,
    width: 17,
  },
  portalFeatureIconImageBlue: {
    tintColor: "#2a64e8",
  },
  portalFeatureIconImageGreen: {
    tintColor: "#18a05e",
  },
  portalFeatureIconImageGold: {
    tintColor: "#ff9d00",
  },
  portalFeatureTitle: {
    color: "#092d66",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4,
    textAlign: "center",
  },
  portalFeatureText: {
    color: "#65758d",
    fontSize: 8,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  portalSegment: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderColor: "#e4ebf3",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    height: 32,
    marginTop: 8,
    padding: 3,
    position: "relative",
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    width: "84%",
    zIndex: 3,
  },
  portalSegmentThumb: {
    backgroundColor: "#073b82",
    borderRadius: 8,
    bottom: 3,
    left: 3,
    position: "absolute",
    top: 3,
    width: "50%",
  },
  portalSegmentText: {
    color: "#092d66",
    fontSize: 10,
    fontWeight: "900",
  },
  portalSegmentTextActive: {
    color: "#fff",
  },
  portalFormCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    elevation: 4,
    marginHorizontal: 34,
    marginTop: 8,
    paddingBottom: 11,
    paddingHorizontal: 18,
    paddingTop: 11,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    zIndex: 2,
  },
  portalFormTitle: {
    color: "#092d66",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  portalFormSubtitle: {
    color: "#607087",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 2,
    textAlign: "center",
  },
  portalLabel: {
    color: "#092d66",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 4,
    marginTop: 5,
    textTransform: "uppercase",
  },
  portalInputShell: {
    alignItems: "center",
    backgroundColor: "#fbfdff",
    borderColor: "#dbe4f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    height: 34,
    overflow: "hidden",
  },
  portalInputIcon: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#f1f6fb",
    borderRightColor: "#e0e8f2",
    borderRightWidth: 1,
    justifyContent: "center",
    width: 34,
  },
  portalInputIconText: {
    color: "#0f4592",
    fontSize: 10,
    fontWeight: "900",
  },
  portalInput: {
    color: "#10233f",
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  portalEyeButton: {
    paddingHorizontal: 10,
  },
  portalEyeText: {
    color: "#7a879a",
    fontSize: 8,
    fontWeight: "900",
  },
  portalHelperText: {
    color: "#5b6470",
    fontSize: 8,
    fontWeight: "700",
    lineHeight: 12,
    marginTop: 6,
  },
  portalErrorText: {
    color: "#b42318",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 7,
  },
  portalOptionsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
    marginTop: 7,
  },
  portalRememberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  portalCheckBox: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#b8c6d8",
    borderRadius: 4,
    borderWidth: 1,
    height: 13,
    justifyContent: "center",
    width: 13,
  },
  portalCheckBoxActive: {
    backgroundColor: "#073b82",
    borderColor: "#073b82",
  },
  portalCheckText: {
    color: "transparent",
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 8,
  },
  portalRememberText: {
    color: "#65758d",
    fontSize: 8,
    fontWeight: "700",
  },
  portalForgotText: {
    color: "#1458bf",
    fontSize: 8,
    fontWeight: "800",
  },
  portalLoginButton: {
    alignItems: "center",
    backgroundColor: "#073b82",
    borderRadius: 999,
    elevation: 5,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 34,
    shadowColor: "#073b82",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  portalLoginText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  portalOrRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 7,
    marginTop: 7,
  },
  portalOrLine: {
    backgroundColor: "#e4c46b",
    flex: 1,
    height: 1,
  },
  portalOrBubble: {
    alignItems: "center",
    backgroundColor: "#fff7df",
    borderRadius: 999,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  portalOrText: {
    color: "#6b7280",
    fontSize: 8,
    fontWeight: "900",
  },
  portalAdminButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#9db1d1",
    borderRadius: 999,
    borderWidth: 1.2,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 30,
  },
  portalAdminText: {
    color: "#0b397b",
    fontSize: 10,
    fontWeight: "900",
  },
  portalFooter: {
    alignItems: "center",
    bottom: 9,
    left: 34,
    position: "absolute",
    right: 34,
    zIndex: 2,
  },
  portalFooterText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 13,
    textAlign: "center",
  },
  portalFooterAuthor: {
    color: "#efc44d",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 3,
  },
  appShell: {
    flex: 1,
    backgroundColor: "#f7f9fd",
  },
  header: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e8eef7",
    borderRadius: 14,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginHorizontal: 10,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  headerBrandRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  headerLogo: {
    height: 48,
    width: 48,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerSchool: {
    color: "#092d66",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: "#30415d",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff4d6",
    borderColor: "#f3c44d",
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  roleBadgeText: {
    color: "#9a6500",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 0,
  },
  dashboardLogoutButton: {
    alignItems: "center",
    backgroundColor: "#f8fbff",
    borderColor: "#dbe7f5",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dashboardLogoutIconText: {
    color: "#0b75a0",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 15,
  },
  dashboardLogoutText: {
    color: "#0b75a0",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 2,
  },
  content: {
    padding: 10,
    paddingBottom: 116,
  },
  sectionTabsWrap: {
    borderBottomColor: "transparent",
    borderBottomWidth: 0,
    marginBottom: 10,
    paddingBottom: 0,
  },
  sectionTabsBar: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 2,
  },
  sectionTabButton: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 6,
    paddingBottom: 7,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  sectionTabButtonActive: {
    borderBottomColor: "#2f68ff",
  },
  sectionTabIcon: {
    backgroundColor: "#092d66",
    borderColor: "#092d66",
    borderRadius: 3,
    borderWidth: 1,
    height: 13,
    width: 13,
  },
  sectionTabText: {
    color: "#4d5e78",
    fontSize: 11,
    fontWeight: "900",
  },
  sectionTabTextActive: {
    color: "#092d66",
  },
  teacherHomeShell: {
    gap: 12,
  },
  teacherClassCard: {
    backgroundColor: "#08377e",
    borderRadius: 12,
    elevation: 4,
    minHeight: 124,
    overflow: "hidden",
    padding: 12,
    position: "relative",
    shadowColor: "#08377e",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  teacherClassTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  teacherClassLogoWrap: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  teacherClassLogo: {
    height: 40,
    width: 40,
  },
  teacherClassTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  teacherClassSchool: {
    color: "#ffd15c",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  teacherClassMeta: {
    color: "#d9e8ff",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  teacherClassTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 18,
  },
  teacherClassYearRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  teacherClassYear: {
    color: "#d9e8ff",
    fontSize: 9,
    fontWeight: "800",
  },
  teacherClassArt: {
    bottom: 8,
    height: 92,
    position: "absolute",
    right: 6,
    width: 150,
  },
  teacherClassArtImage: {
    height: "100%",
    width: "100%",
  },
  teacherStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  teacherStatCard: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    flexBasis: "48%",
    flexGrow: 1,
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  teacherStatBlue: {
    backgroundColor: "#eaf3ff",
  },
  teacherStatGreen: {
    backgroundColor: "#e9f9ef",
  },
  teacherStatRed: {
    backgroundColor: "#fff0ef",
  },
  teacherStatAmber: {
    backgroundColor: "#fff6df",
  },
  teacherStatIconWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.66)",
    borderRadius: 999,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  teacherStatIcon: {
    color: "#1d7fdb",
    fontSize: 16,
    fontWeight: "900",
  },
  teacherStatIconImage: {
    height: 22,
    width: 22,
  },
  teacherStatBody: {
    flex: 1,
    justifyContent: "center",
  },
  teacherStatLabel: {
    color: "#617089",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  teacherStatValue: {
    color: "#08377e",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 26,
    marginTop: 2,
  },
  teacherStatMeta: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  teacherFeatureSection: {
    marginTop: 2,
  },
  teacherSectionTitleWrap: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  teacherSectionTitle: {
    color: "#092d66",
    fontSize: 13,
    fontWeight: "900",
  },
  teacherSectionUnderline: {
    backgroundColor: "#f2b02e",
    borderRadius: 999,
    height: 2,
    marginTop: 2,
    width: 42,
  },
  teacherFeatureList: {
    backgroundColor: "#fff",
    borderColor: "#e7eef7",
    borderRadius: 12,
    borderWidth: 1,
    elevation: 3,
    overflow: "hidden",
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  teacherFeatureItem: {
    alignItems: "center",
    borderBottomColor: "#eef3f8",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  teacherFeatureIcon: {
    alignItems: "center",
    backgroundColor: "#eef5ff",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  teacherFeatureIconText: {
    color: "#2457d6",
    fontSize: 15,
    fontWeight: "900",
  },
  teacherFeatureIconImage: {
    height: 17,
    tintColor: "#2457d6",
    width: 17,
  },
  teacherFeatureBody: {
    flex: 1,
    minWidth: 0,
  },
  teacherFeatureTitle: {
    color: "#092d66",
    fontSize: 11,
    fontWeight: "900",
  },
  teacherFeatureMeta: {
    color: "#667085",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  teacherFeatureChevron: {
    color: "#667085",
    fontSize: 24,
    fontWeight: "700",
  },
  tabDock: {
    backgroundColor: "#fff",
    borderColor: "#e7eef7",
    borderRadius: 14,
    borderWidth: 1,
    bottom: 10,
    elevation: 8,
    left: 12,
    paddingBottom: 7,
    paddingTop: 7,
    position: "absolute",
    right: 12,
    shadowColor: "#0b2f63",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  parentTabScroller: {
    paddingHorizontal: 6,
  },
  parentTabBar: {
    flexDirection: "row",
    gap: 4,
  },
  parentTabButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 10,
    borderWidth: 0,
    flex: 1,
    flexBasis: 0,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  parentTabButtonActive: {
    backgroundColor: "#0b4eb0",
    elevation: 3,
    shadowColor: "#0b4eb0",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: "#2f6eff",
  },
  parentTabBadge: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    height: 18,
    justifyContent: "center",
    marginBottom: 2,
    width: 22,
  },
  parentTabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  parentTabBadgeIcon: {
    lineHeight: 16,
  },
  parentTabBadgeImage: {
    height: 16,
    width: 16,
  },
  parentTabBadgeText: {
    color: "#63708a",
    fontSize: 14,
    fontWeight: "900",
  },
  parentTabBadgeTextActive: {
    color: "#fff",
  },
  parentTabText: {
    color: "#63708a",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  parentTabTextActive: {
    color: "#fff",
  },
});

