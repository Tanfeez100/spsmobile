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
import { Feather, Ionicons } from "@expo/vector-icons";
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

const getSectionVectorIcon = (sectionKey, isActive) => {
  switch (sectionKey) {
    case "home":
      return isActive ? "home" : "home-outline";
    case "attendance":
      return isActive ? "calendar" : "calendar-outline";
    case "fees":
      return isActive ? "wallet" : "wallet-outline";
    case "results":
      return isActive ? "trophy" : "trophy-outline";
    case "marks":
      return isActive ? "document-text" : "document-text-outline";
    case "reportsHistory":
      return isActive ? "stats-chart" : "stats-chart-outline";
    default:
      return isActive ? "grid" : "grid-outline";
  }
};

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

const getTabIconName = (key) => {
  switch (key) {
    case "home":
      return "home";
    case "attendance":
      return "calendar";
    case "leave":
    case "leaves":
      return "send";
    case "holidays":
      return "sun";
    case "fees":
      return "credit-card";
    case "results":
      return "award";
    case "today":
      return "check-circle";
    case "history":
      return "clock";
    case "submitMarks":
      return "edit-3";
    case "viewMarks":
      return "file-text";
    default:
      return "grid";
  }
};

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
  if (!session.tokenExpiresAt) return false;

  const expiresAt = Date.parse(session.tokenExpiresAt);
  if (!Number.isFinite(expiresAt)) return false;

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
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    loadSession()
      .then(setSessionState)
      .finally(() => setBooting(false));
  }, []);

  const handleSession = async (nextSession) => {
    setSessionState(nextSession);
    await saveSession(nextSession);
  };

  const refreshTeacherSession = useCallback(async (sessionToRefresh) => {
    const activeSession = sessionToRefresh || sessionRef.current;
    if (activeSession?.role !== "teacher" || !activeSession?.refreshToken) {
      return activeSession;
    }

    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = (async () => {
        const response = await refreshTeacherToken(activeSession.refreshToken);
        const token = getAccessToken(response);
        const refreshToken = getRefreshToken(response) || activeSession.refreshToken;

        if (!token) {
          throw new Error("Refresh response me token nahi mila.");
        }

        const nextSession = {
          ...activeSession,
          token,
          refreshToken,
          user: response.user || activeSession.user,
          tokenExpiresAt: getTokenExpiresAt(response),
          savedAt: new Date().toISOString(),
        };

        setSessionState(nextSession);
        await saveSession(nextSession);
        return nextSession;
      })().finally(() => {
        refreshInFlightRef.current = null;
      });
    }

    return refreshInFlightRef.current;
  }, []);

  useEffect(() => {
    if (session?.role !== "teacher" || !session?.refreshToken) return undefined;

    return registerAuthRefreshHandler(async () => {
      const refreshedSession = await refreshTeacherSession(sessionRef.current);
      return refreshedSession?.token || "";
    });
  }, [refreshTeacherSession, session?.refreshToken, session?.role]);

  useEffect(() => {
    if (session?.role !== "teacher" || !session?.refreshToken) return undefined;

    let refreshTimer;
    let cancelled = false;

    const scheduleRefresh = (activeSession) => {
      if (cancelled || activeSession?.role !== "teacher" || !activeSession.refreshToken) return;

      const expiresAt = Date.parse(activeSession.tokenExpiresAt || "");
      const fallbackMs = 25 * 60 * 1000;
      const minDelayMs = 15 * 60 * 1000;
      let refreshInMs = fallbackMs;

      if (Number.isFinite(expiresAt)) {
        const diff = expiresAt - Date.now() - 2 * 60 * 1000;
        if (diff > minDelayMs) {
          refreshInMs = Math.min(diff, 24 * 60 * 60 * 1000);
        } else {
          refreshInMs = fallbackMs;
        }
      }

      refreshTimer = setTimeout(async () => {
        try {
          const refreshed = await refreshTeacherSession(activeSession);
          if (!cancelled && refreshed) {
            scheduleRefresh(refreshed);
          }
        } catch (error) {
          console.warn("Teacher session refresh failed:", error.message);
          if (!cancelled) {
            scheduleRefresh({
              ...activeSession,
              tokenExpiresAt: new Date(Date.now() + fallbackMs).toISOString(),
            });
          }
        }
      }, refreshInMs);
    };

    scheduleRefresh(session);

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [refreshTeacherSession, session?.refreshToken, session?.tokenExpiresAt]);

  useEffect(() => {
    if (session?.role !== "teacher" || !session?.refreshToken) return undefined;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const current = sessionRef.current;
        if (shouldRefreshTeacherSession(current)) {
          refreshTeacherSession(current).catch((error) => {
            console.warn("Teacher session refresh on resume failed:", error.message);
          });
        }
      }
    });

    return () => subscription.remove();
  }, [refreshTeacherSession, session?.refreshToken, session?.role]);

  const handleLogout = async () => {
    setSessionState(null);
    await clearSession();
  };

  if (booting) {
    return (
      <SafeAreaView style={[styles.centerScreen, { backgroundColor: "#064e3b" }]}>
        <ExpoStatusBar style="light" />
        <View style={styles.openingBrandCard}>
          <Image source={schoolLogo} style={styles.openingLogo} resizeMode="contain" />
          <Text style={[styles.openingTitle, { color: "#ffffff" }]}>{SCHOOL_NAME}</Text>
          <Text style={[styles.openingSubtitle, { color: "#a7f3d0" }]}>Mobile School Portal</Text>
        </View>
        <ActivityIndicator color="#10b981" size="large" />
        <Text style={[styles.loadingText, { color: "#ecfdf5", marginTop: 12 }]}>Preparing your campus dashboard...</Text>
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
    <SafeAreaView style={[styles.safeArea, !session && { backgroundColor: "#064e3b" }]}>
      <ExpoStatusBar style={session ? "dark" : "light"} />
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
  const scrollViewRef = useRef(null);

  const handleInputFocus = (offset = 140) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: offset, animated: true });
    }, 150);
  };

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
      const cleanIdentity = mode === "student" ? identity.trim().toUpperCase() : identity.trim();
      let cleanPassword = password.trim();
      if (mode === "student") {
        const dmy = cleanPassword.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (dmy) {
          cleanPassword = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
        } else {
          const ymd = cleanPassword.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
          if (ymd) {
            cleanPassword = `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
          }
        }
      }

      const response =
        mode === "teacher"
          ? await loginTeacher(cleanIdentity, password)
          : await loginStudent(cleanIdentity, cleanPassword);
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
        await saveSavedLogin(mode, { identity: cleanIdentity, password });
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      style={styles.portalShell}
    >
      <ScrollView
        ref={scrollViewRef}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.portalContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.portalFrame}>
          <View style={styles.portalPhotoLayer}>
            <Image source={schoolCelebration} style={styles.portalPhotoImage} resizeMode="cover" />
            <View style={styles.portalPhotoWash} />
          </View>
          <View style={styles.portalWhiteSheet} />

          <View style={styles.portalHero}>
            <View style={styles.portalLogoWrap}>
              <View style={styles.portalLogoGlow} />
              <View style={styles.portalLogoRing}>
                <Image source={schoolLogo} style={styles.portalLogoImage} resizeMode="contain" />
              </View>
            </View>

            <View style={styles.portalEyebrowRow}>
              <Text style={styles.portalEyebrow}>{SCHOOL_SHORT_NAME} MOBILE PORTAL</Text>
            </View>
            <Text style={styles.portalTitle}>{SCHOOL_NAME}</Text>
            <Text style={styles.portalSubtitle}>{SCHOOL_TAGLINE}</Text>
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
                <Feather name={mode === "teacher" ? "mail" : "user"} size={18} color="#047857" />
              </View>
              <TextInput
                autoCapitalize={mode === "student" ? "characters" : "none"}
                autoCorrect={false}
                keyboardType={mode === "teacher" ? "email-address" : "default"}
                onChangeText={setIdentity}
                onFocus={() => handleInputFocus(120)}
                placeholder={mode === "teacher" ? "teacher@school.com" : "e.g. STUD0414"}
                placeholderTextColor="#94a3b8"
                style={styles.portalInput}
                value={identity}
              />
            </View>

            <Text style={styles.portalLabel}>{mode === "teacher" ? "PASSWORD" : "PASSWORD / DEFAULT DOB"}</Text>
            <View style={styles.portalInputShell}>
              <View style={styles.portalInputIcon}>
                <Feather name="lock" size={18} color="#047857" />
              </View>
              <TextInput
                onChangeText={setPassword}
                onFocus={() => handleInputFocus(180)}
                placeholder={mode === "student" ? "e.g. Tanfeez2010 or Tanf2010 or DOB" : "Password"}
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                style={styles.portalInput}
                value={password}
              />
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                style={styles.portalEyeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                accessibilityRole="button"
              >
                <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#475569" />
              </Pressable>
            </View>

            {mode === "student" ? (
              <Text style={styles.portalHelperText}>
                First login me default password: Name ke starting letters + Birth Year (e.g. Tanfeez2010 ya Tanf2010) ya Date of Birth. Login ke baad naya password set kar sakte hain.
              </Text>
            ) : null}
            {error ? <Text style={styles.portalErrorText}>{error}</Text> : null}

            <View style={styles.portalOptionsRow}>
              <Pressable
                onPress={() => setRememberPassword((current) => !current)}
                style={styles.portalRememberRow}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <View style={[styles.portalCheckBox, rememberPassword && styles.portalCheckBoxActive]}>
                  {rememberPassword ? <Feather name="check" size={12} color="#fff" /> : null}
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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {agreed ? <Feather name="check" size={13} color="#fff" /> : null}
              </Pressable>
              <Text style={styles.portalConsentText}>
                I agree to the{" "}
                <Text onPress={onOpenPrivacy} style={styles.portalConsentLink}>Privacy Policy</Text>
                {" and "}
                <Text onPress={onOpenTerms} style={styles.portalConsentLink}>Terms & Conditions</Text>.
              </Text>
            </View>

            <Pressable disabled={loading || !agreed} onPress={submit} style={[styles.portalLoginButton, (loading || !agreed) && styles.disabledButton]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.portalLoginText}>Login</Text>}
            </Pressable>
          </View>

          <View style={styles.portalFooter}>
            <Text style={styles.portalFooterText}>
              “Education is the most powerful weapon which you can use to change the world.”
            </Text>
            <Text style={styles.portalFooterAuthor}>— Nelson Mandela</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StudentPasswordSetup({ session, onComplete, onLogout }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
          <View style={styles.passwordInputWrap}>
            <TextInput
              onChangeText={setPassword}
              placeholder="New password (min 6 characters)"
              placeholderTextColor="#8a8f98"
              secureTextEntry={!showNewPassword}
              style={[styles.input, styles.passwordInputFlex]}
              value={password}
            />
            <Pressable
              onPress={() => setShowNewPassword((c) => !c)}
              style={styles.inputEyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name={showNewPassword ? "eye" : "eye-off"} size={20} color="#64748b" />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Confirm Password</Text>
          <View style={styles.passwordInputWrap}>
            <TextInput
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor="#8a8f98"
              secureTextEntry={!showConfirmPassword}
              style={[styles.input, styles.passwordInputFlex]}
              value={confirmPassword}
            />
            <Pressable
              onPress={() => setShowConfirmPassword((c) => !c)}
              style={styles.inputEyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name={showConfirmPassword ? "eye" : "eye-off"} size={20} color="#64748b" />
            </Pressable>
          </View>

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
  const studentName = getStudentDisplayName(student);
  const academicYear = student?.academicYear || student?.academic_year || getDefaultAcademicYear();
  const classLabel = student?.class ? `Class ${student.class}${student?.section ? ` - ${student.section}` : ""}` : "Class -";
  const rollLabel = student?.rollNo || student?.roll_no || "-";
  const admNo = student?.admissionNumber || student?.admission_number || student?.username || "-";

  const sections = [
    {
      title: "Academic Information",
      icon: "book-open",
      items: [
        { label: "Class & Section", value: classLabel },
        { label: "Roll Number", value: `Roll #${rollLabel}` },
        { label: "Academic Session", value: academicYear },
        { label: "Student Status", value: student?.status ? String(student.status).toUpperCase() : "ACTIVE" },
        { label: "Admission Number", value: admNo },
        { label: "Admission Date", value: formatProfileDate(student?.admissionDate || student?.admission_date) },
      ],
    },
    {
      title: "Family & Guardians",
      icon: "users",
      items: [
        { label: "Father's Name", value: student?.fatherName || student?.father_name || "-" },
        { label: "Mother's Name", value: student?.motherName || student?.mother_name || "-" },
        { label: "Guardian Contact", value: student?.mobile || "-" },
        { label: "Residential Address", value: student?.address || "-" },
      ],
    },
    {
      title: "Official Identifiers",
      icon: "file-text",
      items: [
        { label: "Username / Portal ID", value: student?.username || "-" },
        { label: "Date of Birth", value: formatProfileDate(student?.dateOfBirth || student?.date_of_birth) },
        { label: "Gender", value: student?.gender || "-" },
        { label: "PEN Number", value: student?.penNumber || student?.pen_number || "-" },
        { label: "Aadhaar Card", value: student?.aadhaarCard || student?.aadhaar_card || "-" },
      ],
    },
    {
      title: "Facilities & Transport",
      icon: "truck",
      items: [
        { label: "School Transport", value: student?.usesTransport || student?.uses_transport ? "Yes (Active)" : "No" },
        { label: "Transport Fee", value: student?.transportCharge ?? student?.transport_charge ? `Rs. ${student.transportCharge || student.transport_charge}` : "N/A" },
      ],
    },
  ];

  return (
    <View style={styles.profilePageShell}>
      {/* Top Navigation */}
      <View style={styles.profilePageTopRow}>
        <Pressable onPress={onBack} style={styles.profileBackButton}>
          <Feather name="arrow-left" size={14} color="#047857" />
          <Text style={styles.profileBackButtonText}>Dashboard</Text>
        </Pressable>
        <Text style={styles.profilePageKicker}>Official Digital ID</Text>
        <View style={styles.profilePageSpacer} />
      </View>

      {/* DIGITAL CAMPUS ID CARD */}
      <View style={styles.digitalIdCard}>
        {/* Card Header Strip */}
        <View style={styles.digitalIdHeader}>
          <View style={styles.digitalIdHeaderLeft}>
            <View style={styles.digitalIdHeaderLogoWrap}>
              <Image source={schoolLogo} style={styles.digitalIdHeaderLogo} resizeMode="contain" />
            </View>
            <View>
              <Text style={styles.digitalIdSchoolName}>{SCHOOL_NAME}</Text>
              <Text style={styles.digitalIdSubtitle}>STUDENT CAMPUS ID • {academicYear}</Text>
            </View>
          </View>
          <View style={styles.digitalIdChip}>
            <Text style={styles.digitalIdChipText}>VERIFIED</Text>
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.digitalIdBody}>
          <View style={styles.digitalIdAvatarWrap}>
            <Image
              source={getProfilePhotoSource(student)}
              style={styles.digitalIdAvatar}
              resizeMode="cover"
            />
            <View style={styles.digitalIdActiveDot}>
              <Feather name="check" size={10} color="#fff" />
            </View>
          </View>

          <View style={styles.digitalIdStudentInfo}>
            <Text numberOfLines={1} style={styles.digitalIdStudentName}>{studentName}</Text>
            <View style={styles.digitalIdTagsRow}>
              <View style={styles.digitalIdTag}>
                <Text style={styles.digitalIdTagText}>{classLabel}</Text>
              </View>
              <View style={styles.digitalIdTag}>
                <Text style={styles.digitalIdTagText}>Roll #{rollLabel}</Text>
              </View>
            </View>
            <Text style={styles.digitalIdStudentAdm}>Adm ID: {admNo}</Text>
          </View>
        </View>

        {/* Decorative Barcode / Serial Row */}
        <View style={styles.digitalIdBarcodeRow}>
          <View style={styles.digitalIdBarcodeBars}>
            <Text style={styles.digitalIdBarcodeSymbol}>||| | |||| || ||| || |||| | ||| |||</Text>
          </View>
          <Text style={styles.digitalIdBarcodeNumber}>
            OFFICIAL DIGITAL BADGE • SPS-{rollLabel}
          </Text>
        </View>
      </View>

      {/* CATEGORIZED INFORMATION SECTIONS */}
      <View style={styles.profileGrid}>
        {sections.map((section) => (
          <View key={section.title} style={styles.profileSectionCard}>
            <View style={styles.profileSectionHeaderRow}>
              <View style={styles.profileSectionIconWrap}>
                <Feather name={section.icon} size={14} color="#047857" />
              </View>
              <Text style={styles.profileSectionTitle}>{section.title}</Text>
            </View>

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

      {/* SCHOOL POLICY & HELP MENU */}
      <View style={styles.profileMenuCard}>
        <Text style={styles.profileMenuTitle}>School Support & Policies</Text>
        <View style={styles.profileMenuList}>
          <Pressable onPress={onOpenContact} style={styles.profileMenuItem}>
            <View style={[styles.profileMenuIconWrap, { backgroundColor: "#ecfdf5" }]}>
              <Feather name="phone" size={16} color="#047857" />
            </View>
            <View style={styles.profileMenuTextWrap}>
              <Text style={styles.profileMenuLabel}>Contact School Office</Text>
              <Text style={styles.profileMenuSub}>{SCHOOL_PHONE} • Office Hours</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={onOpenPrivacy} style={styles.profileMenuItem}>
            <View style={[styles.profileMenuIconWrap, { backgroundColor: "#f0fdf4" }]}>
              <Feather name="shield" size={16} color="#059669" />
            </View>
            <View style={styles.profileMenuTextWrap}>
              <Text style={styles.profileMenuLabel}>Privacy Policy</Text>
              <Text style={styles.profileMenuSub}>Student data privacy & safety guidelines</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={onOpenTerms} style={styles.profileMenuItem}>
            <View style={[styles.profileMenuIconWrap, { backgroundColor: "#eff6ff" }]}>
              <Feather name="file-text" size={16} color="#2563eb" />
            </View>
            <View style={styles.profileMenuTextWrap}>
              <Text style={styles.profileMenuLabel}>Terms & Conditions</Text>
              <Text style={styles.profileMenuSub}>Usage terms for mobile application</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      {/* LOGOUT BUTTON */}
      <Pressable onPress={onLogout} style={styles.studentLogoutButton}>
        <Feather name="log-out" size={16} color="#e11d48" />
        <Text style={styles.studentLogoutButtonText}>Sign Out from Student Portal</Text>
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
              <View style={styles.teacherHeaderBadge}>
                <Feather name="award" size={9} color="#047857" />
                <Text style={styles.teacherHeaderBadgeText}>Faculty Portal</Text>
              </View>
            ) : (
              <View style={styles.studentHeaderBadge}>
                <Feather name="shield" size={9} color="#047857" />
                <Text style={styles.studentHeaderBadgeText}>Student</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerActions}>
          {session.role === "teacher" ? (
            <Pressable onPress={onLogout} style={styles.teacherHeaderLogoutBtn}>
              <Feather name="log-out" size={13} color="#e11d48" />
              <Text style={styles.teacherHeaderLogoutText}>Logout</Text>
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
              <View style={styles.avatarOnlineDot} />
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
                    style={({ pressed }) => [
                      styles.parentTabButton,
                      isActive && styles.parentTabButtonActive,
                      pressed && styles.parentTabButtonPressed,
                    ]}
                  >
                    <View style={[styles.parentTabBadge, isActive && styles.parentTabBadgeActive]}>
                      <Ionicons
                        name={getSectionVectorIcon(section.key, isActive)}
                        size={21}
                        color={isActive ? "#047857" : "#64748b"}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[styles.parentTabText, isActive && styles.parentTabTextActive]}
                    >
                      {section.title}
                    </Text>
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

  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;

  const inFlightRef = useRef(false);
  const bootstrapRef = useRef(null);
  const studentsCacheRef = useRef({});

  const load = useCallback(
    async ({ silent = false, keyOverride, force = false } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      // Don't unmount the whole UI with a full-screen loader if data is already visible
      if (!silent && students.length === 0) setLoading(true);
      setError("");
      setMessage("");
      setSaved(false);

      try {
        let currentBoot = bootstrapRef.current;
        if (!currentBoot || force) {
          currentBoot = await getAttendanceBootstrap(session.token);
          bootstrapRef.current = currentBoot;
          setBootstrap(currentBoot);
        }

        const nextAssignments = currentBoot?.assignments || [];
        const activeTargetKey = keyOverride || selectedKeyRef.current;
        const nextSelected =
          nextAssignments.find((item) => assignmentKey(item) === activeTargetKey) || nextAssignments[0];

        if (nextSelected) {
          const nextKey = assignmentKey(nextSelected);
          if (nextKey !== selectedKeyRef.current) {
            setSelectedKey(nextKey);
          }
          const scope = assignmentParams(nextSelected);

          let normalizedStudents = force ? null : studentsCacheRef.current[nextKey];
          const studentPromise = normalizedStudents
            ? Promise.resolve(null)
            : getStudents(session.token, scope);

          const recordPromise = getAttendanceRecords(session.token, { ...scope, date });

          const [studentResponse, recordResponse] = await Promise.all([
            studentPromise,
            recordPromise,
          ]);

          if (studentResponse) {
            normalizedStudents = normalizeStudents(studentResponse);
            studentsCacheRef.current[nextKey] = normalizedStudents;
          }

          if (normalizedStudents) {
            setStudents(normalizedStudents);
          }

          const isHolidayDate = Boolean(recordResponse?.isHoliday);
          const nextRecords = recordResponse?.records || [];
          setRecords(nextRecords);
          setSelectedDateIsHoliday(isHolidayDate);
          setStatuses(
            (normalizedStudents || []).reduce((map, student) => {
              const existing = nextRecords.find((record) => record.student_id === student.id);
              map[student.id] = isHolidayDate ? "" : existing?.status || "present";
              return map;
            }, {}),
          );
        } else {
          setStudents([]);
          setRecords([]);
          setStatuses({});
          setSelectedDateIsHoliday(false);
          setMessage(currentBoot?.message || "Aapko abhi class/section assign nahi hua hai.");
        }
      } catch (err) {
        setError(err.message || "Teacher data load failed");
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date, session.token],
  );

  useEffect(() => {
    load();
  }, [date, session.token]);

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
      await load({ silent: true, force: true });
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
    load({ silent: true, force: true });
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
          session={session}
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

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent && !detail) setLoading(true);
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
    },
    [detail, onStudentLoaded, session.token, session.user?.id],
  );

  useEffect(() => {
    load();
  }, [session.token, session.user?.id]);

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
      {activeTab === "home" ? <StudentHome session={session} student={student} summary={summary} onTabChange={onTabChange} /> : null}
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
          const iconName = getTabIconName(tab.key);

          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={[styles.sectionTabButton, active && styles.sectionTabButtonActive]}
            >
              <Feather name={iconName} size={13} color={active ? "#ffffff" : "#4b5563"} />
              <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TeacherHome({ assignment, onOpen, records, students, session }) {
  const summary = summarizeRecords(records);
  const academicYear = assignment?.academic_year || getDefaultAcademicYear();
  const classLabel = assignment ? `Class ${assignment.class} - ${assignment.section}` : "Assigned Class";
  const teacherName = session?.user?.name || session?.user?.email?.split("@")[0] || "Faculty Educator";

  const totalStudents = students?.length || 0;
  const presentCount = summary?.present || 0;
  const absentCount = summary?.absent || 0;
  const lateCount = summary?.late || 0;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return (
    <View style={styles.teacherHomeShell}>
      {/* 1. TEACHER WORKSPACE HERO CARD */}
      <View style={styles.teacherHeroCard}>
        <View style={styles.teacherHeroCardTop}>
          <View style={styles.teacherHeroBrandWrap}>
            <View style={styles.teacherHeroLogoWrap}>
              <Image source={schoolLogo} style={styles.teacherHeroLogo} resizeMode="contain" />
            </View>
            <View style={styles.teacherHeroSchoolText}>
              <Text style={styles.teacherHeroSchoolName}>{SCHOOL_NAME}</Text>
              <Text style={styles.teacherHeroPortalLabel}>TEACHER WORKSPACE &amp; FACULTY PORTAL</Text>
            </View>
          </View>
          <View style={styles.teacherVerifiedBadge}>
            <Feather name="award" size={10} color="#10b981" />
            <Text style={styles.teacherVerifiedBadgeText}>Faculty Active</Text>
          </View>
        </View>

        <View style={styles.teacherHeroIdentityRow}>
          <View style={styles.teacherHeroAvatarBorder}>
            <View style={styles.teacherHeroAvatarInner}>
              <Text style={styles.teacherHeroAvatarText}>{getInitials(teacherName)}</Text>
            </View>
            <View style={styles.teacherHeroStarBadge}>
              <Feather name="check" size={10} color="#064e3b" />
            </View>
          </View>

          <View style={styles.teacherHeroBio}>
            <Text style={styles.teacherHeroGreeting}>Welcome back,</Text>
            <Text numberOfLines={1} style={styles.teacherHeroTeacherName}>
              {teacherName}
            </Text>
            <View style={styles.teacherHeroPillsContainer}>
              <View style={styles.teacherHeroPill}>
                <Feather name="book-open" size={10} color="#a7f3d0" />
                <Text style={styles.teacherHeroPillText}>{classLabel}</Text>
              </View>
              <View style={styles.teacherHeroPill}>
                <Feather name="users" size={10} color="#a7f3d0" />
                <Text style={styles.teacherHeroPillText}>{totalStudents} Students</Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => onOpen?.("attendance")}
          style={styles.teacherHeroCardFooter}
        >
          <View style={styles.teacherHeroFooterLeft}>
            <Feather name="calendar" size={13} color="#a7f3d0" />
            <Text style={styles.teacherHeroFooterText}>
              Academic Year {academicYear} • {classLabel}
            </Text>
          </View>
          <View style={styles.teacherHeroFooterRight}>
            <Text style={styles.teacherHeroFooterLink}>Take Attendance</Text>
            <Feather name="arrow-right" size={12} color="#ffd15c" />
          </View>
        </Pressable>
      </View>

      {/* 2. TODAY'S CLASS ATTENDANCE METRICS */}
      <View style={styles.teacherAttendanceCard}>
        <View style={styles.teacherCardHeaderRow}>
          <View style={styles.teacherCardHeaderIcon}>
            <Feather name="check-square" size={16} color="#047857" />
          </View>
          <View style={styles.teacherCardHeaderTitles}>
            <Text style={styles.teacherCardSectionTitle}>Today's Class Attendance</Text>
            <Text style={styles.teacherCardSectionMeta}>
              {totalStudents > 0 ? `${presentCount} of ${totalStudents} students present today` : "No student records"}
            </Text>
          </View>
          <Pressable onPress={() => onOpen?.("attendance")} style={styles.teacherCardHeaderLink}>
            <Text style={styles.teacherCardHeaderLinkText}>Mark</Text>
            <Feather name="chevron-right" size={12} color="#047857" />
          </Pressable>
        </View>

        <View style={styles.teacherAttendanceMeterBlock}>
          <View style={styles.teacherAttendanceScoreRow}>
            <View style={styles.teacherAttendancePercentWrap}>
              <Text style={styles.teacherAttendancePercentText}>{attendanceRate}%</Text>
              <Text style={styles.teacherAttendancePercentLabel}>Today's Presence Rate</Text>
            </View>
            <View style={styles.teacherAttendanceStatusPill}>
              <Text style={styles.teacherAttendanceStatusText}>
                {presentCount} / {totalStudents} Present
              </Text>
            </View>
          </View>

          <View style={styles.teacherProgressBarTrack}>
            <View
              style={[
                styles.teacherProgressBarFill,
                { width: `${Math.min(100, Math.max(4, attendanceRate))}%` },
              ]}
            />
          </View>
        </View>

        {/* 4 Stat Badges */}
        <View style={styles.teacherMetricsGrid}>
          <View style={[styles.teacherMetricPillCard, styles.teacherMetricStudents]}>
            <Feather name="users" size={14} color="#0284c7" />
            <Text style={[styles.teacherMetricNum, { color: "#0284c7" }]}>{totalStudents}</Text>
            <Text style={styles.teacherMetricTag}>Enrolled</Text>
          </View>
          <View style={[styles.teacherMetricPillCard, styles.teacherMetricPresent]}>
            <Feather name="check-circle" size={14} color="#059669" />
            <Text style={styles.teacherMetricNum}>{presentCount}</Text>
            <Text style={styles.teacherMetricTag}>Present</Text>
          </View>
          <View style={[styles.teacherMetricPillCard, styles.teacherMetricAbsent]}>
            <Feather name="x-circle" size={14} color="#e11d48" />
            <Text style={[styles.teacherMetricNum, { color: "#e11d48" }]}>{absentCount}</Text>
            <Text style={styles.teacherMetricTag}>Absent</Text>
          </View>
          <View style={[styles.teacherMetricPillCard, styles.teacherMetricLate]}>
            <Feather name="clock" size={14} color="#d97706" />
            <Text style={[styles.teacherMetricNum, { color: "#d97706" }]}>{lateCount}</Text>
            <Text style={styles.teacherMetricTag}>Late</Text>
          </View>
        </View>
      </View>

      {/* 3. CORE TEACHER OPERATIONS (2x2 GRID) */}
      <View style={styles.teacherServicesSection}>
        <View style={styles.teacherSectionTitleWrap}>
          <Text style={styles.teacherSectionTitle}>Core Operations</Text>
          <Text style={styles.teacherSectionMeta}>Essential daily classroom tools</Text>
        </View>

        <View style={styles.teacherServicesGrid}>
          {/* Card 1: GPS Punch In/Out */}
          <Pressable
            onPress={() => onOpen?.("gpsAttendance")}
            style={({ pressed }) => [styles.teacherServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.teacherServiceIconWrap, { backgroundColor: "#ecfdf5" }]}>
              <Feather name="map-pin" size={20} color="#047857" />
            </View>
            <View style={styles.teacherServiceBody}>
              <Text style={styles.teacherServiceTitle}>GPS Punch</Text>
              <Text style={styles.teacherServiceSubtitle}>Check In, Out &amp; Leaves</Text>
            </View>
            <View style={styles.teacherServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#047857" />
            </View>
          </Pressable>

          {/* Card 2: Class Attendance */}
          <Pressable
            onPress={() => onOpen?.("attendance")}
            style={({ pressed }) => [styles.teacherServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.teacherServiceIconWrap, { backgroundColor: "#f0fdf4" }]}>
              <Feather name="check-square" size={20} color="#16a34a" />
            </View>
            <View style={styles.teacherServiceBody}>
              <Text style={styles.teacherServiceTitle}>Class Attendance</Text>
              <Text style={styles.teacherServiceSubtitle}>Mark daily student register</Text>
            </View>
            <View style={styles.teacherServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#16a34a" />
            </View>
          </Pressable>

          {/* Card 3: Submit Marks */}
          <Pressable
            onPress={() => onOpen?.("submitMarks")}
            style={({ pressed }) => [styles.teacherServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.teacherServiceIconWrap, { backgroundColor: "#eef2ff" }]}>
              <Feather name="award" size={20} color="#4f46e5" />
            </View>
            <View style={styles.teacherServiceBody}>
              <Text style={styles.teacherServiceTitle}>Submit Marks</Text>
              <Text style={styles.teacherServiceSubtitle}>Enter terminal exam grades</Text>
            </View>
            <View style={styles.teacherServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#4f46e5" />
            </View>
          </Pressable>

          {/* Card 4: Reports */}
          <Pressable
            onPress={() => onOpen?.("reports")}
            style={({ pressed }) => [styles.teacherServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.teacherServiceIconWrap, { backgroundColor: "#f0fdfa" }]}>
              <Feather name="bar-chart-2" size={20} color="#0d9488" />
            </View>
            <View style={styles.teacherServiceBody}>
              <Text style={styles.teacherServiceTitle}>Class Reports</Text>
              <Text style={styles.teacherServiceSubtitle}>Monthly analytics &amp; trends</Text>
            </View>
            <View style={styles.teacherServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#0d9488" />
            </View>
          </Pressable>
        </View>
      </View>

      {/* 4. CLASSROOM MANAGEMENT TOOLS (SECONDARY LIST) */}
      <View style={styles.teacherToolsSection}>
        <View style={styles.teacherSectionTitleWrap}>
          <Text style={styles.teacherSectionTitle}>Classroom Management</Text>
          <Text style={styles.teacherSectionMeta}>Rosters, scorecards and holiday schedules</Text>
        </View>

        <View style={styles.teacherToolsList}>
          <Pressable onPress={() => onOpen?.("students")} style={styles.teacherToolItem}>
            <View style={[styles.teacherToolIconWrap, { backgroundColor: "#eff6ff" }]}>
              <Feather name="users" size={16} color="#2563eb" />
            </View>
            <View style={styles.teacherToolTextWrap}>
              <Text style={styles.teacherToolLabel}>Enrolled Students Roster</Text>
              <Text style={styles.teacherToolSub}>View {totalStudents} students with roll and fee status</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={() => onOpen?.("viewMarks")} style={styles.teacherToolItem}>
            <View style={[styles.teacherToolIconWrap, { backgroundColor: "#fdf4ff" }]}>
              <Feather name="file-text" size={16} color="#c026d3" />
            </View>
            <View style={styles.teacherToolTextWrap}>
              <Text style={styles.teacherToolLabel}>View Submitted Marks</Text>
              <Text style={styles.teacherToolSub}>Review submitted subject and terminal scorecards</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={() => onOpen?.("history")} style={styles.teacherToolItem}>
            <View style={[styles.teacherToolIconWrap, { backgroundColor: "#fefce8" }]}>
              <Feather name="clock" size={16} color="#ca8a04" />
            </View>
            <View style={styles.teacherToolTextWrap}>
              <Text style={styles.teacherToolLabel}>Student Attendance History</Text>
              <Text style={styles.teacherToolSub}>Individual daily student attendance logs</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={() => onOpen?.("gpsHistory")} style={styles.teacherToolItem}>
            <View style={[styles.teacherToolIconWrap, { backgroundColor: "#ecfdf5" }]}>
              <Feather name="navigation" size={16} color="#059669" />
            </View>
            <View style={styles.teacherToolTextWrap}>
              <Text style={styles.teacherToolLabel}>My Personal GPS History</Text>
              <Text style={styles.teacherToolSub}>Monthly check-in, check-out and work hours</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={() => onOpen?.("holidays")} style={styles.teacherToolItem}>
            <View style={[styles.teacherToolIconWrap, { backgroundColor: "#fff7ed" }]}>
              <Feather name="sun" size={16} color="#ea580c" />
            </View>
            <View style={styles.teacherToolTextWrap}>
              <Text style={styles.teacherToolLabel}>School Holiday Calendar</Text>
              <Text style={styles.teacherToolSub}>Official academic holidays and breaks</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StudentHome({ session, student, summary, onTabChange }) {
  const workingDays = Number(
    summary?.workingDays ||
      Number(summary?.present || 0) + Number(summary?.absent || 0) + Number(summary?.late || 0) ||
      0
  );
  const percentage = Number(
    summary?.percentage ||
      (workingDays > 0 ? Math.round((Number(summary.present || 0) / workingDays) * 100) : 0)
  );
  const studentName = getStudentDisplayName(student);
  const academicYear = student?.academicYear || student?.academic_year || getDefaultAcademicYear();
  const classLabel = student?.class ? `Class ${student.class}${student?.section ? ` - ${student.section}` : ""}` : "Class -";
  const rollLabel = student?.rollNo || student?.roll_no ? `Roll #${student?.rollNo || student?.roll_no}` : "Roll -";
  const studentIdLabel = student?.admissionNumber || student?.admission_number || student?.username || "SPS-STU";

  const isGreat = percentage >= 80;
  const isOk = percentage >= 70 && percentage < 80;
  const ratingText = workingDays === 0 ? "Tracking Session Active" : isGreat ? "Excellent Track • Exam Ready" : isOk ? "Good Standing • Maintain 75%+" : "Low Attendance • Attention Needed";

  return (
    <View style={styles.studentHomeShell}>
      {/* 1. DIGITAL STUDENT ID CARD HERO */}
      <View style={styles.studentHeroCard}>
        <View style={styles.studentHeroCardTop}>
          <View style={styles.studentHeroBrandWrap}>
            <View style={styles.studentHeroLogoWrap}>
              <Image source={schoolLogo} style={styles.studentHeroLogo} resizeMode="contain" />
            </View>
            <View style={styles.studentHeroSchoolText}>
              <Text style={styles.studentHeroSchoolName}>{SCHOOL_NAME}</Text>
              <Text style={styles.studentHeroPortalLabel}>OFFICIAL STUDENT PORTAL</Text>
            </View>
          </View>
          <View style={styles.studentVerifiedBadge}>
            <Feather name="shield" size={10} color="#10b981" />
            <Text style={styles.studentVerifiedBadgeText}>Verified</Text>
          </View>
        </View>

        <View style={styles.studentHeroIdentityRow}>
          <View style={styles.studentHeroAvatarBorder}>
            <Image
              source={getProfilePhotoSource(student)}
              style={styles.studentHeroAvatarImg}
              resizeMode="cover"
            />
            <View style={styles.studentHeroStarBadge}>
              <Feather name="star" size={10} color="#064e3b" />
            </View>
          </View>

          <View style={styles.studentHeroBio}>
            <Text style={styles.studentHeroGreeting}>Welcome back,</Text>
            <Text numberOfLines={1} style={styles.studentHeroStudentName}>
              {studentName}
            </Text>
            <View style={styles.studentHeroPillsContainer}>
              <View style={styles.studentHeroPill}>
                <Feather name="book-open" size={10} color="#a7f3d0" />
                <Text style={styles.studentHeroPillText}>{classLabel}</Text>
              </View>
              <View style={styles.studentHeroPill}>
                <Text style={styles.studentHeroPillText}>{rollLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => onTabChange?.("profile")}
          style={styles.studentHeroCardFooter}
        >
          <View style={styles.studentHeroFooterLeft}>
            <Feather name="credit-card" size={13} color="#a7f3d0" />
            <Text style={styles.studentHeroFooterText}>
              ID: {studentIdLabel} • Session {academicYear}
            </Text>
          </View>
          <View style={styles.studentHeroFooterRight}>
            <Text style={styles.studentHeroFooterLink}>Digital ID</Text>
            <Feather name="arrow-right" size={12} color="#ffd15c" />
          </View>
        </Pressable>
      </View>

      {/* 2. ATTENDANCE PERFORMANCE HEALTH CARD */}
      <View style={styles.studentAttendanceCard}>
        <View style={styles.studentCardHeaderRow}>
          <View style={styles.studentCardHeaderIcon}>
            <Feather name="calendar" size={16} color="#047857" />
          </View>
          <View style={styles.studentCardHeaderTitles}>
            <Text style={styles.studentCardSectionTitle}>Attendance Overview</Text>
            <Text style={styles.studentCardSectionMeta}>{ratingText}</Text>
          </View>
          <Pressable onPress={() => onTabChange?.("attendance")} style={styles.studentCardHeaderLink}>
            <Text style={styles.studentCardHeaderLinkText}>Details</Text>
            <Feather name="chevron-right" size={12} color="#047857" />
          </Pressable>
        </View>

        <View style={styles.studentAttendanceMeterBlock}>
          <View style={styles.studentAttendanceScoreRow}>
            <View style={styles.studentAttendancePercentWrap}>
              <Text style={styles.studentAttendancePercentText}>{percentage}%</Text>
              <Text style={styles.studentAttendancePercentLabel}>Academic Year Score</Text>
            </View>
            <View style={styles.studentAttendanceStatusPill}>
              <Text style={styles.studentAttendanceStatusText}>
                {summary.present || 0} / {workingDays || 0} Attended
              </Text>
            </View>
          </View>

          {/* Dynamic Progress Bar */}
          <View style={styles.studentProgressBarTrack}>
            <View
              style={[
                styles.studentProgressBarFill,
                { width: `${Math.min(100, Math.max(4, percentage))}%` },
                percentage < 75 && styles.studentProgressBarLow,
              ]}
            />
          </View>
        </View>

        {/* 4 Attendance Metrics in Grid */}
        <View style={styles.studentMetricsGrid}>
          <View style={[styles.studentMetricPillCard, styles.studentMetricPresent]}>
            <Feather name="check-circle" size={14} color="#059669" />
            <Text style={styles.studentMetricNum}>{summary.present || 0}</Text>
            <Text style={styles.studentMetricTag}>Present</Text>
          </View>
          <View style={[styles.studentMetricPillCard, styles.studentMetricAbsent]}>
            <Feather name="x-circle" size={14} color="#e11d48" />
            <Text style={[styles.studentMetricNum, { color: "#e11d48" }]}>{summary.absent || 0}</Text>
            <Text style={styles.studentMetricTag}>Absent</Text>
          </View>
          <View style={[styles.studentMetricPillCard, styles.studentMetricLate]}>
            <Feather name="clock" size={14} color="#d97706" />
            <Text style={[styles.studentMetricNum, { color: "#d97706" }]}>{summary.late || 0}</Text>
            <Text style={styles.studentMetricTag}>Late</Text>
          </View>
          <View style={[styles.studentMetricPillCard, styles.studentMetricDays]}>
            <Feather name="calendar" size={14} color="#0284c7" />
            <Text style={[styles.studentMetricNum, { color: "#0284c7" }]}>{workingDays}</Text>
            <Text style={styles.studentMetricTag}>Total Days</Text>
          </View>
        </View>
      </View>

      {/* 3. QUICK SERVICES / SHORTCUTS GRID */}
      <View style={styles.studentServicesSection}>
        <View style={styles.studentSectionTitleWrap}>
          <Text style={styles.studentSectionTitle}>Campus Services</Text>
          <Text style={styles.studentSectionMeta}>Instant access to student records</Text>
        </View>

        <View style={styles.studentServicesGrid}>
          {/* Card 1: Fee Portal */}
          <Pressable
            onPress={() => onTabChange?.("fees")}
            style={({ pressed }) => [styles.studentServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.studentServiceIconWrap, { backgroundColor: "#ecfdf5" }]}>
              <Feather name="credit-card" size={20} color="#047857" />
            </View>
            <View style={styles.studentServiceBody}>
              <Text style={styles.studentServiceTitle}>Fee Portal</Text>
              <Text style={styles.studentServiceSubtitle}>Dues, Online Pay & Receipts</Text>
            </View>
            <View style={styles.studentServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#047857" />
            </View>
          </Pressable>

          {/* Card 2: Exam Results */}
          <Pressable
            onPress={() => onTabChange?.("results")}
            style={({ pressed }) => [styles.studentServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.studentServiceIconWrap, { backgroundColor: "#eef2ff" }]}>
              <Feather name="award" size={20} color="#4f46e5" />
            </View>
            <View style={styles.studentServiceBody}>
              <Text style={styles.studentServiceTitle}>Report Cards</Text>
              <Text style={styles.studentServiceSubtitle}>Terminal Marks & Progress</Text>
            </View>
            <View style={styles.studentServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#4f46e5" />
            </View>
          </Pressable>

          {/* Card 3: Attendance */}
          <Pressable
            onPress={() => onTabChange?.("attendance")}
            style={({ pressed }) => [styles.studentServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.studentServiceIconWrap, { backgroundColor: "#f0fdfa" }]}>
              <Feather name="calendar" size={20} color="#0d9488" />
            </View>
            <View style={styles.studentServiceBody}>
              <Text style={styles.studentServiceTitle}>Attendance Log</Text>
              <Text style={styles.studentServiceSubtitle}>Day-wise monthly records</Text>
            </View>
            <View style={styles.studentServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#0d9488" />
            </View>
          </Pressable>

          {/* Card 4: Leave & Holidays */}
          <Pressable
            onPress={() => onTabChange?.("leave")}
            style={({ pressed }) => [styles.studentServiceCard, pressed && styles.cardPressed]}
          >
            <View style={[styles.studentServiceIconWrap, { backgroundColor: "#fefce8" }]}>
              <Feather name="send" size={20} color="#ca8a04" />
            </View>
            <View style={styles.studentServiceBody}>
              <Text style={styles.studentServiceTitle}>Apply Leave</Text>
              <Text style={styles.studentServiceSubtitle}>Leave status & School calendar</Text>
            </View>
            <View style={styles.studentServiceArrowWrap}>
              <Feather name="arrow-up-right" size={14} color="#ca8a04" />
            </View>
          </Pressable>
        </View>
      </View>

      {/* 4. NOTICES & ANNOUNCEMENTS */}
      <View style={styles.studentNoticeSection}>
        <View style={styles.studentSectionTitleWrap}>
          <Text style={styles.studentSectionTitle}>Notice Board & Alerts</Text>
          <Text style={styles.studentSectionMeta}>Official announcements from administration</Text>
        </View>
        <StudentNotificationsPanel session={session} limit={6} />
      </View>

      {/* 5. CAMPUS HELPDESK INFO BANNER */}
      <View style={styles.studentHelpdeskCard}>
        <View style={styles.studentHelpdeskTop}>
          <Feather name="help-circle" size={16} color="#047857" />
          <Text style={styles.studentHelpdeskTitle}>School Helpdesk & Support</Text>
        </View>
        <Text style={styles.studentHelpdeskBody}>
          For fee queries, bus routes, or technical issues, contact the school office.
        </Text>
        <View style={styles.studentHelpdeskRow}>
          <Pressable
            onPress={() => Linking.openURL(`tel:${SCHOOL_PHONE}`).catch(() => {})}
            style={styles.studentHelpdeskBtn}
          >
            <Feather name="phone" size={12} color="#047857" />
            <Text style={styles.studentHelpdeskBtnText}>{SCHOOL_PHONE}</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(`mailto:${SCHOOL_EMAIL}`).catch(() => {})}
            style={styles.studentHelpdeskBtn}
          >
            <Feather name="mail" size={12} color="#047857" />
            <Text style={styles.studentHelpdeskBtnText}>Email Office</Text>
          </Pressable>
        </View>
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

      {students.length && !isHoliday ? (
        <View style={styles.attendanceBulkRow}>
          <Text style={styles.attendanceBulkLabel}>Quick Fill All:</Text>
          <View style={styles.attendanceBulkButtons}>
            <Pressable
              disabled={disabled || saving}
              onPress={() => students.forEach((s) => onStatusChange(s.id, "present"))}
              style={[styles.attendanceBulkBtn, styles.attendanceBulkPresent]}
            >
              <Feather name="check-circle" size={12} color="#047857" />
              <Text style={styles.attendanceBulkBtnTextPresent}>All Present</Text>
            </Pressable>
            <Pressable
              disabled={disabled || saving}
              onPress={() => students.forEach((s) => onStatusChange(s.id, "absent"))}
              style={[styles.attendanceBulkBtn, styles.attendanceBulkAbsent]}
            >
              <Feather name="x-circle" size={12} color="#e11d48" />
              <Text style={styles.attendanceBulkBtnTextAbsent}>All Absent</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {students.length ? (
        students.map((student) => (
          <View key={student.id} style={styles.attendanceCard}>
            <View style={styles.attendanceHeader}>
              <View style={styles.attendanceStudentInfo}>
                <View style={styles.attendanceAvatar}>
                  <Text style={styles.attendanceAvatarText}>{getInitials(student.name)}</Text>
                </View>
                <View>
                  <Text style={styles.rowTitle}>{student.name || "Student"}</Text>
                  <Text style={styles.rowMeta}>
                    Roll #{student.rollNo || student.roll_no || "-"} • {student.class || ""} {student.section || ""}
                  </Text>
                </View>
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
            <Feather name="alert-triangle" size={18} color="#047857" />
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
          <Feather name="log-in" size={18} color="#047857" />
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
          <Feather name="clock" size={18} color="#047857" />
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

const TERMINAL_TABS = [
  { key: "First", label: "1st Term" },
  { key: "Second", label: "2nd Term" },
  { key: "Third", label: "3rd Term" },
  { key: "Annual", label: "Annual Exam" },
];

const getSubjectIcon = (subjectName = "") => {
  const s = String(subjectName).toLowerCase();
  if (s.includes("math") || s.includes("arith")) return "hash";
  if (s.includes("eng") || s.includes("urdu") || s.includes("hindi") || s.includes("sanskrit") || s.includes("lang")) return "book-open";
  if (s.includes("sci") || s.includes("phys") || s.includes("chem") || s.includes("bio")) return "activity";
  if (s.includes("draw") || s.includes("art")) return "feather";
  if (s.includes("comp") || s.includes("it")) return "cpu";
  if (s.includes("soc") || s.includes("hist") || s.includes("geog") || s.includes("civ")) return "globe";
  return "book";
};

const getMarksGrade = (percentage) => {
  if (percentage >= 90) return { grade: "A+", label: "Outstanding", color: "#047857", bg: "#ecfdf5" };
  if (percentage >= 80) return { grade: "A", label: "Excellent", color: "#059669", bg: "#ecfdf5" };
  if (percentage >= 70) return { grade: "B+", label: "Very Good", color: "#0284c7", bg: "#f0f9ff" };
  if (percentage >= 60) return { grade: "B", label: "Good", color: "#2563eb", bg: "#eff6ff" };
  if (percentage >= 50) return { grade: "C", label: "Average", color: "#d97706", bg: "#fffbeb" };
  if (percentage >= 33) return { grade: "D", label: "Pass", color: "#ea580c", bg: "#fff7ed" };
  return { grade: "F", label: "Fail", color: "#e11d48", bg: "#fff1f2" };
};

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
  const [showRoster, setShowRoster] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  const [existingMarksData, setExistingMarksData] = useState(null);

  const academicYear = assignment?.academic_year || getDefaultAcademicYear();

  useEffect(() => {
    if (!students.length) return;
    const exists = students.some((s) => s.id === selectedStudentId);
    if (!exists) {
      setSelectedStudentId(students[0].id);
      setRollNo(String(students[0].rollNo || ""));
    }
  }, [students]);

  const loadSubjects = useCallback(async () => {
    if (!assignment?.class) return;
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
  }, [assignment?.class, assignment?.section, session.token]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const loadExistingMarks = useCallback(async () => {
    if (!assignment?.class || !assignment?.section || !terminal) return;
    try {
      const response = await getMarks(session.token, {
        class: assignment.class,
        section: assignment.section,
        terminal,
      });
      setExistingMarksData(response);
    } catch {
      // Non-critical, ignore
    }
  }, [assignment?.class, assignment?.section, session.token, terminal]);

  useEffect(() => {
    loadExistingMarks();
  }, [loadExistingMarks]);

  // When selected student, terminal, subjects, or existingMarksData change, populate marks
  useEffect(() => {
    if (!subjects.length || !selectedStudentId) return;

    const studentRecord = existingMarksData?.students?.find(
      (s) => s.student_id === selectedStudentId || String(s.roll_no) === String(rollNo),
    );

    const existingStudentMarks = studentRecord?.marks || [];

    setMarks(
      subjects.map((subject) => {
        const found = existingStudentMarks.find(
          (m) =>
            m.subject_id === subject.id ||
            String(m.subject_name || "").toLowerCase() === String(subject.name || "").toLowerCase() ||
            String(m.subject_code || "").toLowerCase() === String(subject.code || "").toLowerCase(),
        );

        return {
          subject_name: subject.name,
          subject_code: subject.code,
          external_marks:
            found && found.external_marks !== null && found.external_marks !== undefined
              ? String(found.external_marks)
              : "",
          internal_marks:
            found && found.internal_marks !== null && found.internal_marks !== undefined
              ? String(found.internal_marks)
              : "",
        };
      }),
    );
  }, [selectedStudentId, terminal, existingMarksData, subjects]);

  const isEditingExisting = useMemo(() => {
    const studentRecord = existingMarksData?.students?.find(
      (s) => s.student_id === selectedStudentId || String(s.roll_no) === String(rollNo),
    );
    return Boolean(studentRecord?.marks?.length);
  }, [existingMarksData, selectedStudentId, rollNo]);

  const selectStudent = (student) => {
    if (!student) return;
    setSelectedStudentId(student.id);
    setRollNo(String(student.rollNo || ""));
    setError("");
    setMessage("");
    setShowRoster(false);
  };

  const currentIndex = students.findIndex((s) => s.id === selectedStudentId);
  const selectedStudent = students[currentIndex >= 0 ? currentIndex : 0] || students[0];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < students.length - 1;
  const nextStudent = hasNext ? students[currentIndex + 1] : null;

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(
      (s) =>
        String(s.name || "").toLowerCase().includes(q) ||
        String(s.rollNo || "").toLowerCase().includes(q) ||
        String(s.admissionNumber || "").toLowerCase().includes(q),
    );
  }, [students, studentSearch]);

  const updateMark = (index, field, value) => {
    const subject = subjects[index];
    const rules = getSubjectRules(subject?.name);
    const cleanValue = String(value || "").replace(/[^\d]/g, "");
    const numericValue = cleanValue === "" ? "" : Number(cleanValue);
    const maxAllowed = field === "external_marks" ? rules.externalMax : rules.internalMax;

    if (field === "internal_marks" && !rules.internalAllowed) return;
    if (numericValue !== "" && numericValue > maxAllowed) {
      setError(`${subject?.name || "Subject"}: Max ${maxAllowed} marks allowed for ${field === "external_marks" ? "Theory" : "Internal"}.`);
      return;
    }

    setError("");
    setMarks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: numericValue };
      return next;
    });
  };

  const clearCurrentMarks = () => {
    setMarks(
      subjects.map((subject) => ({
        subject_name: subject.name,
        subject_code: subject.code,
        external_marks: "",
        internal_marks: "",
      })),
    );
    setError("");
    setMessage("Marks cleared.");
  };

  // Live Performance Calculations
  const totalObtained = useMemo(() => {
    return marks.reduce((sum, mark) => {
      const ext = Number(mark.external_marks || 0);
      const int = Number(mark.internal_marks || 0);
      return sum + ext + int;
    }, 0);
  }, [marks]);

  const totalMax = useMemo(() => {
    return subjects.reduce((sum, subject) => {
      const rules = getSubjectRules(subject?.name);
      return sum + rules.externalMax + (rules.internalAllowed ? rules.internalMax : 0);
    }, 0);
  }, [subjects]);

  const hasEnteredAnyMarks = useMemo(() => {
    return marks.some((m) => m.external_marks !== "" || m.internal_marks !== "");
  }, [marks]);

  const enteredSubjectsCount = useMemo(() => {
    return marks.filter((m) => m.external_marks !== "" || m.internal_marks !== "").length;
  }, [marks]);

  const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
  const gradeInfo = getMarksGrade(percentage);

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
      setMessage(response?.message || `Marks saved successfully for ${selectedStudent?.name || "Student"}!`);
      await loadExistingMarks();
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
    <View style={styles.marksPanelContainer}>
      {/* 1. HERO CARD: EXAM ASSESSMENT & TERMINAL SELECTOR */}
      <View style={styles.marksHeroShell}>
        <View style={styles.marksHeroTop}>
          <View style={styles.marksHeroBadge}>
            <Feather name="award" size={11} color="#a7f3d0" />
            <Text style={styles.marksHeroBadgeText}>
              Class {assignment.class} - {assignment.section} • Session {academicYear}
            </Text>
          </View>
        </View>

        <Text style={styles.marksHeroTitle}>Student Exam Marks Entry</Text>
        <Text style={styles.marksHeroSub}>Select evaluation terminal & enter subject scores</Text>

        {/* Terminal Segmented Tabs */}
        <View style={styles.marksTerminalPillsRow}>
          {TERMINAL_TABS.map((item) => {
            const active = terminal === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setTerminal(item.key);
                  setMessage("");
                  setError("");
                }}
                style={[styles.marksTerminalPill, active && styles.marksTerminalPillActive]}
              >
                <Text style={[styles.marksTerminalPillText, active && styles.marksTerminalPillTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. STUDENT SPOTLIGHT & STEPPER CARD */}
      <View style={styles.marksStudentSpotlightCard}>
        <View style={styles.marksStudentMainRow}>
          <View style={styles.marksStudentAvatarWrap}>
            <Text style={styles.marksStudentAvatarText}>{getInitials(selectedStudent?.name)}</Text>
          </View>

          <View style={styles.marksStudentInfoCol}>
            <Text numberOfLines={1} style={styles.marksStudentName}>
              {selectedStudent?.name || "Select Student"}
            </Text>
            <View style={styles.marksStudentTagsRow}>
              <View style={styles.marksStudentRollPill}>
                <Text style={styles.marksStudentRollText}>Roll #{selectedStudent?.rollNo || "-"}</Text>
              </View>
              {isEditingExisting ? (
                <View style={[styles.marksStudentRollPill, { backgroundColor: "#f0f9ff", borderColor: "#bae6fd" }]}>
                  <Text style={[styles.marksStudentRollText, { color: "#0284c7" }]}>Edit Mode</Text>
                </View>
              ) : (
                <View style={[styles.marksStudentRollPill, { backgroundColor: "#fefce8", borderColor: "#fef08a" }]}>
                  <Text style={[styles.marksStudentRollText, { color: "#854d0e" }]}>New Entry</Text>
                </View>
              )}
              {selectedStudent?.admissionNumber ? (
                <Text style={styles.marksStudentAdmText}>Adm: {selectedStudent.admissionNumber}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Stepper Navigation: Prev < | Student 3 of 20 | Next > */}
        <View style={styles.marksStepperRow}>
          <Pressable
            disabled={!hasPrev || saving}
            onPress={() => hasPrev && selectStudent(students[currentIndex - 1])}
            style={[styles.marksStepperBtn, (!hasPrev || saving) && styles.marksStepperBtnDisabled]}
          >
            <Feather name="chevron-left" size={14} color="#047857" />
            <Text style={styles.marksStepperBtnText}>Prev</Text>
          </Pressable>

          <Text style={styles.marksStepperCounter}>
            Student {currentIndex >= 0 ? currentIndex + 1 : 1} of {students.length}
          </Text>

          <Pressable
            disabled={!hasNext || saving}
            onPress={() => hasNext && selectStudent(students[currentIndex + 1])}
            style={[styles.marksStepperBtn, (!hasNext || saving) && styles.marksStepperBtnDisabled]}
          >
            <Text style={styles.marksStepperBtnText}>Next</Text>
            <Feather name="chevron-right" size={14} color="#047857" />
          </Pressable>
        </View>

        {/* Quick Roster Dropdown / Search Toggle */}
        <Pressable
          onPress={() => setShowRoster((prev) => !prev)}
          style={styles.marksRosterToggle}
        >
          <Feather name={showRoster ? "chevron-up" : "search"} size={12} color="#047857" />
          <Text style={styles.marksRosterToggleText}>
            {showRoster ? "Hide Student Roster" : "Search / Pick Another Student"}
          </Text>
        </Pressable>

        {showRoster ? (
          <View style={styles.marksRosterSheet}>
            <TextInput
              onChangeText={setStudentSearch}
              placeholder="Search by name or roll number..."
              placeholderTextColor="#94a3b8"
              style={styles.marksRosterSearchInput}
              value={studentSearch}
            />
            <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
              {filteredStudents.map((s) => {
                const active = s.id === selectedStudentId;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => selectStudent(s)}
                    style={[styles.marksRosterItem, active && styles.marksRosterItemActive]}
                  >
                    <Text style={styles.marksRosterItemName}>{s.name}</Text>
                    <Text style={styles.marksRosterItemMeta}>Roll #{s.rollNo || "-"}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* 3. LIVE SCORECARD PREVIEW */}
      {hasEnteredAnyMarks ? (
        <View style={styles.marksSummaryCard}>
          <View style={styles.marksSummaryHeader}>
            <Text style={styles.marksSummaryHeaderTitle}>Live Evaluation Preview</Text>
            <View style={[styles.teacherAttendanceStatusPill, { backgroundColor: gradeInfo.bg, borderColor: gradeInfo.color }]}>
              <Text style={[styles.teacherAttendanceStatusText, { color: gradeInfo.color }]}>
                Grade {gradeInfo.grade} • {gradeInfo.label}
              </Text>
            </View>
          </View>

          <View style={styles.marksSummaryGrid}>
            <View style={styles.marksSummaryBox}>
              <Text style={styles.marksSummaryBoxNum}>{totalObtained} / {totalMax}</Text>
              <Text style={styles.marksSummaryBoxLabel}>Total Marks</Text>
            </View>
            <View style={styles.marksSummaryBox}>
              <Text style={[styles.marksSummaryBoxNum, { color: gradeInfo.color }]}>{percentage}%</Text>
              <Text style={styles.marksSummaryBoxLabel}>Percentage</Text>
            </View>
            <View style={styles.marksSummaryBox}>
              <Text style={[styles.marksSummaryBoxNum, { color: "#0284c7" }]}>{enteredSubjectsCount}/{subjects.length}</Text>
              <Text style={styles.marksSummaryBoxLabel}>Subjects</Text>
            </View>
          </View>

          <View style={styles.teacherProgressBarTrack}>
            <View
              style={[
                styles.teacherProgressBarFill,
                { width: `${Math.min(100, Math.max(5, percentage))}%`, backgroundColor: gradeInfo.color },
              ]}
            />
          </View>
        </View>
      ) : null}

      {error ? <Notice tone="error" text={error} /> : null}
      {message ? <Notice tone="success" text={message} /> : null}

      {/* QUICK BUTTON TO PROCEED TO NEXT STUDENT IF SAVED */}
      {message && nextStudent ? (
        <Pressable
          onPress={() => selectStudent(nextStudent)}
          style={styles.marksNextStudentAction}
        >
          <Text style={styles.marksNextStudentText}>
            Grade Next Student: Roll #{nextStudent.rollNo} ({nextStudent.name})
          </Text>
          <Feather name="arrow-right" size={14} color="#047857" />
        </Pressable>
      ) : null}

      {loading ? <LoadingBlock label="Loading class subjects..." /> : null}

      {/* 4. SUBJECT MARKS CARDS */}
      {!loading && subjects.length ? (
        subjects.map((subject, index) => {
          const rules = getSubjectRules(subject.name);
          const icon = getSubjectIcon(subject.name);
          const extVal = marks[index]?.external_marks ?? "";
          const intVal = marks[index]?.internal_marks ?? "";
          const extNum = Number(extVal || 0);
          const intNum = Number(intVal || 0);
          const hasVal = extVal !== "" || intVal !== "";
          const subjectTotal = extNum + intNum;
          const subjectMax = rules.externalMax + (rules.internalAllowed ? rules.internalMax : 0);
          const isOverMax = extNum > rules.externalMax || (rules.internalAllowed && intNum > rules.internalMax);

          return (
            <View key={subject.id || subject.name} style={styles.marksItemCard}>
              <View style={styles.marksItemHeader}>
                <View style={styles.marksItemIconWrap}>
                  <Feather name={icon} size={16} color="#047857" />
                </View>
                <View style={styles.marksItemTitles}>
                  <Text style={styles.marksItemName}>{subject.name}</Text>
                  <Text style={styles.marksItemMeta}>
                    {subject.code ? `${subject.code} • ` : ""}Max {subjectMax}
                  </Text>
                </View>

                {hasVal ? (
                  <View style={styles.marksItemScorePill}>
                    <Text style={styles.marksItemScoreText}>
                      {subjectTotal} / {subjectMax}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.marksItemInputRow}>
                {/* External / Theory */}
                <View style={styles.marksItemInputCol}>
                  <Text style={styles.marksFieldLabel}>
                    Theory (Max {rules.externalMax})
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => updateMark(index, "external_marks", value)}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    style={[
                      styles.marksInputEnhanced,
                      extNum > rules.externalMax && styles.marksInputError,
                    ]}
                    value={String(extVal)}
                  />
                </View>

                {/* Internal / Practical (if applicable) */}
                {rules.internalAllowed ? (
                  <View style={styles.marksItemInputCol}>
                    <Text style={styles.marksFieldLabel}>
                      Practical (Max {rules.internalMax})
                    </Text>
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => updateMark(index, "internal_marks", value)}
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      style={[
                        styles.marksInputEnhanced,
                        intNum > rules.internalMax && styles.marksInputError,
                      ]}
                      value={String(intVal)}
                    />
                  </View>
                ) : (
                  <View style={styles.marksDrawingBanner}>
                    <Text style={styles.marksDrawingBannerText}>No Internal (Full 50 Marks)</Text>
                  </View>
                )}
              </View>

              {isOverMax ? (
                <Text style={styles.errorText}>
                  Entered marks exceed allowed limits!
                </Text>
              ) : null}
            </View>
          );
        })
      ) : null}

      {!loading && !subjects.length ? (
        <EmptyState title="No subjects" text="Selected class/section ke subjects backend me nahi mile." />
      ) : null}

      {/* 5. ACTIONS: CLEAR & SUBMIT */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 20 }}>
        {hasEnteredAnyMarks ? (
          <Pressable
            disabled={saving}
            onPress={clearCurrentMarks}
            style={[styles.outlineButton, { flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="rotate-ccw" size={14} color="#047857" />
              <Text style={{ color: "#047857", fontWeight: "800", fontSize: 13 }}>Clear</Text>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          disabled={saving || loading || !subjects.length}
          onPress={saveMarks}
          style={[
            styles.primaryButton,
            { flex: hasEnteredAnyMarks ? 2 : 1 },
            (saving || loading || !subjects.length) && styles.disabledButton,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.buttonContentRow}>
              <Feather name={isEditingExisting ? "edit-3" : "check-circle"} size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {isEditingExisting ? "Update Marks" : "Submit Marks"}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
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
  }, [assignment?.class, assignment?.section, session.token, terminal]);

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
          <Feather name="info" size={18} color="#047857" />
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
                      <Feather name={decorIcon} size={24} color="#047857" />
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

function StudentAttendance({ records = [], summary }) {
  const workingDays = Number(
    summary?.workingDays ||
      Number(summary?.present || 0) + Number(summary?.absent || 0) + Number(summary?.late || 0) ||
      0
  );
  const percentage = Number(
    summary?.percentage ||
      (workingDays > 0 ? Math.round((Number(summary.present || 0) / workingDays) * 100) : 0)
  );

  return (
    <View style={styles.studentAttendancePage}>
      {/* 1. ATTENDANCE SUMMARY BANNER */}
      <View style={styles.studentAttBannerCard}>
        <View style={styles.studentAttBannerTop}>
          <View>
            <Text style={styles.studentAttBannerEyebrow}>ACADEMIC SESSION RECORD</Text>
            <Text style={styles.studentAttBannerScore}>{percentage}% Attendance</Text>
          </View>
          <View style={styles.studentAttBannerPill}>
            <Text style={styles.studentAttBannerPillText}>
              {summary.present || 0} / {workingDays || 0} Days
            </Text>
          </View>
        </View>

        <View style={styles.studentProgressBarTrack}>
          <View
            style={[
              styles.studentProgressBarFill,
              { width: `${Math.min(100, Math.max(4, percentage))}%` },
              percentage < 75 && styles.studentProgressBarLow,
            ]}
          />
        </View>

        <View style={styles.studentMetricsGrid}>
          <View style={[styles.studentMetricPillCard, styles.studentMetricPresent]}>
            <Feather name="check-circle" size={13} color="#059669" />
            <Text style={styles.studentMetricNum}>{summary.present || 0}</Text>
            <Text style={styles.studentMetricTag}>Present</Text>
          </View>
          <View style={[styles.studentMetricPillCard, styles.studentMetricAbsent]}>
            <Feather name="x-circle" size={13} color="#e11d48" />
            <Text style={[styles.studentMetricNum, { color: "#e11d48" }]}>{summary.absent || 0}</Text>
            <Text style={styles.studentMetricTag}>Absent</Text>
          </View>
          <View style={[styles.studentMetricPillCard, styles.studentMetricLate]}>
            <Feather name="clock" size={13} color="#d97706" />
            <Text style={[styles.studentMetricNum, { color: "#d97706" }]}>{summary.late || 0}</Text>
            <Text style={styles.studentMetricTag}>Late</Text>
          </View>
          <View style={[styles.studentMetricPillCard, styles.studentMetricDays]}>
            <Feather name="calendar" size={13} color="#0284c7" />
            <Text style={[styles.studentMetricNum, { color: "#0284c7" }]}>{workingDays}</Text>
            <Text style={styles.studentMetricTag}>Total</Text>
          </View>
        </View>
      </View>

      {/* 2. DAY-WISE ATTENDANCE HISTORY LIST */}
      <View style={styles.studentAttHistorySection}>
        <View style={styles.studentSectionTitleWrap}>
          <Text style={styles.studentSectionTitle}>Day-wise Attendance Logs</Text>
          <Text style={styles.studentSectionMeta}>Daily records submitted by assigned class teacher</Text>
        </View>

        {!records?.length ? (
          <View style={styles.studentAttEmptyCard}>
            <Feather name="calendar" size={32} color="#94a3b8" />
            <Text style={styles.studentAttEmptyTitle}>No attendance records</Text>
            <Text style={styles.studentAttEmptyText}>
              Is session ke liye attendance record abhi tak update nahi hua hai.
            </Text>
          </View>
        ) : (
          <View style={styles.studentAttRecordList}>
            {records.map((record) => {
              const rawDate = record.attendance_date;
              const parsedDate = new Date(rawDate);
              const dayNum = !isNaN(parsedDate) ? parsedDate.getDate() : "--";
              const monthName = !isNaN(parsedDate)
                ? parsedDate.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()
                : "DATE";
              const dayOfWeek = !isNaN(parsedDate)
                ? parsedDate.toLocaleDateString("en-IN", { weekday: "long" })
                : "";
              const formattedDate = formatDisplayDate(rawDate);

              const status = String(record.status || "present").toLowerCase();
              const isPresent = status === "present";
              const isAbsent = status === "absent";
              const isLate = status === "late";

              return (
                <View
                  key={record.id || `${record.attendance_date}`}
                  style={styles.studentAttRecordRow}
                >
                  <View style={styles.studentAttDateBadge}>
                    <Text style={styles.studentAttDayNumber}>{dayNum}</Text>
                    <Text style={styles.studentAttMonthText}>{monthName}</Text>
                  </View>

                  <View style={styles.studentAttRecordDetails}>
                    <Text style={styles.studentAttRecordDay}>{dayOfWeek || "School Day"}</Text>
                    <Text style={styles.studentAttRecordFullDate}>{formattedDate}</Text>
                    {record.remark ? (
                      <Text style={styles.studentAttRecordRemark}>{record.remark}</Text>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.studentAttStatusPill,
                      isPresent && styles.studentAttPillPresent,
                      isAbsent && styles.studentAttPillAbsent,
                      isLate && styles.studentAttPillLate,
                    ]}
                  >
                    <Feather
                      name={isPresent ? "check" : isAbsent ? "x" : isLate ? "clock" : "circle"}
                      size={11}
                      color={isPresent ? "#047857" : isAbsent ? "#e11d48" : isLate ? "#d97706" : "#475569"}
                    />
                    <Text
                      style={[
                        styles.studentAttStatusText,
                        isPresent && { color: "#047857" },
                        isAbsent && { color: "#e11d48" },
                        isLate && { color: "#d97706" },
                      ]}
                    >
                      {record.status || "Present"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
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
  const iconColor = tone === "error" ? "#9f2f21" : tone === "success" ? "#166534" : "#047857";

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
    teal: "#047857",
    green: "#16a34a",
    red: "#ef4444",
    amber: "#f59e0b",
  }[tone] || "#047857");

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
    color: "#059669",
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
    backgroundColor: "#ecfdf5",
  },
  segmentText: {
    color: "#52606d",
    fontSize: 14,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: "#059669",
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
    color: "#064e3b",
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
    shadowColor: "#06372b",
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
    borderColor: "#047857",
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
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownItemActive: {
    backgroundColor: "#ecfdf5",
  },
  dropdownItemText: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "700",
  },
  dropdownItemTextActive: {
    color: "#059669",
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
    shadowColor: "#06372b",
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
    color: "#059669",
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
    shadowColor: "#06372b",
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
    backgroundColor: "#ecfdf5",
    borderColor: "#047857",
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
    color: "#059669",
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
    backgroundColor: "#ecfdf5",
    borderColor: "#047857",
  },
  dashboardFilterText: {
    color: "#52606d",
    fontSize: 12,
    fontWeight: "900",
  },
  dashboardFilterTextActive: {
    color: "#059669",
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
    backgroundColor: "#047857",
    borderRadius: 18,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 56,
    shadowColor: "#047857",
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
    backgroundColor: "#ecfdf5",
    borderColor: "#c9daf7",
    borderWidth: 1,
  },
  actionButtonPrimary: {
    backgroundColor: "#047857",
    borderColor: "#047857",
    borderWidth: 1,
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  actionButtonText: {
    color: "#047857",
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
    borderBottomColor: "#047857",
  },
  sectionTabIcon: {
    borderColor: "#8a8f98",
    borderRadius: 2,
    borderWidth: 1.4,
    height: 12,
    width: 12,
  },
  sectionTabIconActive: {
    borderColor: "#047857",
  },
  sectionTabText: {
    color: "#8a8f98",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionTabTextActive: {
    color: "#047857",
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
    backgroundColor: "#047857",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#059669",
    marginBottom: 14,
    overflow: "hidden",
    padding: 20,
    shadowColor: "#047857",
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
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    width: "48%",
  },
  metric_teal: {
    backgroundColor: "#ecfdf5",
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
    color: "#06372b",
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
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: "#d1fae5",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  featureIconText: {
    color: "#059669",
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
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: "#047857",
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
    shadowColor: "#06372b",
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
    color: "#064e3b",
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
    shadowColor: "#06372b",
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
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  holidayMonthButtonActive: {
    borderColor: "#bcd0f4",
  },
  holidayMonthButtonText: {
    color: "#064e3b",
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
    shadowColor: "#06372b",
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
    shadowColor: "#06372b",
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
    color: "#059669",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  holidayDateDay: {
    color: "#064e3b",
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
    color: "#064e3b",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24,
  },
  holidayItemDate: {
    color: "#047857",
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
    shadowColor: "#06372b",
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
    backgroundColor: "#047857",
    borderColor: "#047857",
    shadowColor: "#047857",
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
    shadowColor: "#06372b",
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
    backgroundColor: "#047857",
    borderColor: "#047857",
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
    color: "#d1fae5",
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
    backgroundColor: "#047857",
    borderColor: "#047857",
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
    shadowColor: "#06372b",
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
    shadowColor: "#06372b",
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
    backgroundColor: "#047857",
    borderColor: "#047857",
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
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  recordRowActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#047857",
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
    backgroundColor: "#d1fae5",
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
    shadowColor: "#06372b",
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
    shadowColor: "#06372b",
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
    backgroundColor: "#064e3b",
  },
  portalContent: {
    alignItems: "center",
    flexGrow: 1,
    paddingBottom: 240,
  },
  portalFrame: {
    alignSelf: "center",
    backgroundColor: "#064e3b",
    flex: 1,
    maxWidth: 430,
    minHeight: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  portalPhotoLayer: {
    backgroundColor: "#d1fae5",
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    height: 202,
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
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 136,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  portalHero: {
    alignItems: "center",
    paddingBottom: 10,
    paddingHorizontal: 24,
    paddingTop: 36,
    zIndex: 2,
  },
  portalLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  portalLogoGlow: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderRadius: 999,
    height: 118,
    position: "absolute",
    width: 118,
  },
  portalLogoRing: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#10b981",
    borderRadius: 999,
    borderWidth: 2.5,
    elevation: 6,
    height: 104,
    justifyContent: "center",
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 104,
  },
  portalLogoImage: {
    height: 90,
    width: 90,
  },
  portalEyebrowRow: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 3.5,
  },
  portalTinyLine: {
    height: 0,
    width: 0,
  },
  portalEyebrow: {
    color: "#047857",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  portalTitle: {
    color: "#064e3b",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 29,
    marginTop: 6,
    textAlign: "center",
  },
  portalSubtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  portalSegment: {
    alignSelf: "center",
    backgroundColor: "#e2e8f0",
    borderRadius: 24,
    elevation: 2,
    flexDirection: "row",
    height: 44,
    marginTop: 12,
    padding: 4,
    position: "relative",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    width: "86%",
    maxWidth: 340,
    zIndex: 3,
  },
  portalSegmentThumb: {
    backgroundColor: "#047857",
    borderRadius: 20,
    bottom: 4,
    left: 4,
    position: "absolute",
    top: 4,
    width: "50%",
    elevation: 3,
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
    color: "#475569",
    fontSize: 14.5,
    fontWeight: "700",
  },
  portalSegmentTextActive: {
    color: "#ffffff",
    fontWeight: "900",
  },
  portalFormCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    elevation: 3,
    marginHorizontal: 22,
    marginTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    borderColor: "#e2e8f0",
    borderWidth: 1,
    zIndex: 2,
  },
  portalFormTitle: {
    color: "#064e3b",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  portalFormSubtitle: {
    color: "#64748b",
    fontSize: 12.5,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 3,
    textAlign: "center",
  },
  portalLabel: {
    color: "#064e3b",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 5,
    marginTop: 5,
    textTransform: "uppercase",
  },
  portalInputShell: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    borderWidth: 1.2,
    flexDirection: "row",
    height: 48,
    overflow: "hidden",
  },
  portalInputIcon: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#f0fdf4",
    borderRightColor: "#dcfce7",
    borderRightWidth: 1.2,
    justifyContent: "center",
    width: 46,
  },
  portalInputIconText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "900",
  },
  portalInput: {
    color: "#0f172a",
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  portalEyeButton: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 14,
  },
  portalEyeText: {
    color: "#64748b",
    fontSize: 12,
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
    borderColor: "#047857",
    borderRadius: 6,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  portalCheckBoxActive: {
    backgroundColor: "#047857",
    borderColor: "#047857",
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
    color: "#047857",
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
    borderColor: "#047857",
    borderRadius: 6,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  portalConsentBoxActive: {
    backgroundColor: "#047857",
    borderColor: "#047857",
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
  portalConsentLink: {
    color: "#047857",
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  passwordInputWrap: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1.2,
    flexDirection: "row",
    height: 48,
    marginBottom: 12,
    overflow: "hidden",
  },
  passwordInputFlex: {
    color: "#0f172a",
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    height: "100%",
    marginBottom: 0,
    borderWidth: 0,
    paddingHorizontal: 12,
  },
  inputEyeBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 14,
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
    backgroundColor: "#047857",
    borderRadius: 999,
    elevation: 5,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 46,
    shadowColor: "#047857",
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
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1.2,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 40,
  },
  portalAdminText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "900",
  },
  portalFooter: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 24,
    paddingHorizontal: 24,
    zIndex: 2,
  },
  portalFooterText: {
    color: "#64748b",
    fontSize: 12.5,
    fontStyle: "italic",
    fontWeight: "500",
    lineHeight: 19,
    textAlign: "center",
  },
  portalFooterAuthor: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 4,
  },
  appShell: {
    flex: 1,
    backgroundColor: "#f4f8f5",
  },
  header: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e1ebe5",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
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
    color: "#064e3b",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: "#2d4a3e",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  roleBadgeText: {
    color: "#047857",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.2,
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
    marginBottom: 12,
  },
  sectionTabsBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
    alignItems: "center",
  },
  sectionTabButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  sectionTabButtonActive: {
    backgroundColor: "#047857",
    borderColor: "#047857",
    elevation: 2,
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sectionTabIcon: {
    display: "none",
  },
  sectionTabText: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "800",
  },
  sectionTabTextActive: {
    color: "#ffffff",
    fontWeight: "900",
  },
  teacherHomeShell: {
    gap: 12,
  },
  teacherClassCard: {
    backgroundColor: "#047857",
    borderRadius: 12,
    elevation: 4,
    minHeight: 124,
    overflow: "hidden",
    padding: 12,
    position: "relative",
    shadowColor: "#047857",
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
    color: "#ecfdf5",
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
    color: "#ecfdf5",
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
    color: "#047857",
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
    color: "#064e3b",
    fontSize: 13,
    fontWeight: "900",
  },
  teacherSectionMeta: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "600",
    marginTop: 1,
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
    shadowColor: "#06372b",
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
    color: "#064e3b",
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
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderColor: "#e2e8f0",
    borderRadius: 22,
    borderWidth: 1,
    bottom: Platform.OS === "ios" ? 20 : 12,
    elevation: 10,
    left: 12,
    paddingBottom: 6,
    paddingTop: 6,
    position: "absolute",
    right: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  parentTabScroller: {
    paddingHorizontal: 4,
  },
  parentTabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 4,
  },
  parentTabButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 16,
    flex: 1,
    flexBasis: 0,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  parentTabButtonActive: {
    backgroundColor: "transparent",
  },
  parentTabButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  parentTabBadge: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginBottom: 3,
    width: 44,
  },
  parentTabBadgeActive: {
    backgroundColor: "#ecfdf5",
  },
  parentTabBadgeIcon: {
    lineHeight: 22,
  },
  parentTabBadgeImage: {
    height: 22,
    width: 22,
  },
  parentTabBadgeText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  parentTabBadgeTextActive: {
    color: "#047857",
  },
  parentTabText: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  parentTabTextActive: {
    color: "#047857",
    fontWeight: "800",
  },
  studentHeaderBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  studentHeaderBadgeText: {
    color: "#047857",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  avatarOnlineDot: {
    backgroundColor: "#10b981",
    borderColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 2,
    bottom: 0,
    height: 12,
    position: "absolute",
    right: 0,
    width: 12,
  },
  studentHomeShell: {
    gap: 14,
  },
  studentHeroCard: {
    backgroundColor: "#064e3b",
    borderColor: "#059669",
    borderRadius: 22,
    borderWidth: 1,
    elevation: 6,
    overflow: "hidden",
    padding: 16,
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  studentHeroCardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  studentHeroBrandWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    flex: 1,
  },
  studentHeroLogoWrap: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  studentHeroLogo: {
    height: 32,
    width: 32,
  },
  studentHeroSchoolText: {
    flex: 1,
  },
  studentHeroSchoolName: {
    color: "#ffd15c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  studentHeroPortalLabel: {
    color: "#a7f3d0",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  studentVerifiedBadge: {
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    borderColor: "rgba(167, 243, 208, 0.4)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  studentVerifiedBadgeText: {
    color: "#ecfdf5",
    fontSize: 9.5,
    fontWeight: "800",
  },
  studentHeroIdentityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingVertical: 4,
  },
  studentHeroAvatarBorder: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 999,
    borderWidth: 2,
    height: 62,
    justifyContent: "center",
    position: "relative",
    width: 62,
  },
  studentHeroAvatarImg: {
    borderRadius: 999,
    height: 56,
    width: 56,
  },
  studentHeroStarBadge: {
    alignItems: "center",
    backgroundColor: "#ffd15c",
    borderRadius: 999,
    bottom: -2,
    height: 18,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 18,
  },
  studentHeroBio: {
    flex: 1,
    minWidth: 0,
  },
  studentHeroGreeting: {
    color: "#a7f3d0",
    fontSize: 11,
    fontWeight: "700",
  },
  studentHeroStudentName: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  studentHeroPillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  studentHeroPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  studentHeroPillText: {
    color: "#ecfdf5",
    fontSize: 10,
    fontWeight: "800",
  },
  studentHeroCardFooter: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  studentHeroFooterLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  studentHeroFooterText: {
    color: "#a7f3d0",
    fontSize: 10,
    fontWeight: "700",
  },
  studentHeroFooterRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  studentHeroFooterLink: {
    color: "#ffd15c",
    fontSize: 10,
    fontWeight: "900",
  },
  studentAttendanceCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    padding: 15,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  studentCardHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  studentCardHeaderIcon: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  studentCardHeaderTitles: {
    flex: 1,
  },
  studentCardSectionTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  studentCardSectionMeta: {
    color: "#059669",
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 1,
  },
  studentCardHeaderLink: {
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 999,
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  studentCardHeaderLinkText: {
    color: "#047857",
    fontSize: 10.5,
    fontWeight: "800",
  },
  studentAttendanceMeterBlock: {
    backgroundColor: "#f8fafc",
    borderColor: "#f1f5f9",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  studentAttendanceScoreRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  studentAttendancePercentWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  studentAttendancePercentText: {
    color: "#047857",
    fontSize: 24,
    fontWeight: "900",
  },
  studentAttendancePercentLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  studentAttendanceStatusPill: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  studentAttendanceStatusText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "800",
  },
  studentProgressBarTrack: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    height: 7,
    overflow: "hidden",
    width: "100%",
  },
  studentProgressBarFill: {
    backgroundColor: "#10b981",
    borderRadius: 999,
    height: "100%",
  },
  studentProgressBarLow: {
    backgroundColor: "#f59e0b",
  },
  studentMetricsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  studentMetricPillCard: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  studentMetricPresent: {
    backgroundColor: "#ecfdf5",
  },
  studentMetricAbsent: {
    backgroundColor: "#fff1f2",
  },
  studentMetricLate: {
    backgroundColor: "#fffbeb",
  },
  studentMetricDays: {
    backgroundColor: "#f0f9ff",
  },
  studentMetricNum: {
    color: "#059669",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  studentMetricTag: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
    textTransform: "uppercase",
  },
  studentServicesSection: {
    marginTop: 4,
  },
  studentSectionTitleWrap: {
    marginBottom: 10,
  },
  studentSectionTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  studentSectionMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  studentServicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  studentServiceCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 110,
    padding: 13,
    position: "relative",
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  studentServiceIconWrap: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    marginBottom: 8,
    width: 38,
  },
  studentServiceBody: {
    flex: 1,
  },
  studentServiceTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  studentServiceSubtitle: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 2,
  },
  studentServiceArrowWrap: {
    bottom: 12,
    position: "absolute",
    right: 12,
  },
  studentNoticeSection: {
    marginTop: 6,
  },
  studentHelpdeskCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d1fae5",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    marginTop: 4,
    padding: 14,
  },
  studentHelpdeskTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  studentHelpdeskTitle: {
    color: "#047857",
    fontSize: 12.5,
    fontWeight: "900",
  },
  studentHelpdeskBody: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "600",
    lineHeight: 15,
    marginTop: 4,
  },
  studentHelpdeskRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  studentHelpdeskBtn: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  studentHelpdeskBtnText: {
    color: "#047857",
    fontSize: 10.5,
    fontWeight: "800",
  },
  studentAttendancePage: {
    gap: 14,
  },
  studentAttBannerCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    padding: 16,
  },
  studentAttBannerTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  studentAttBannerEyebrow: {
    color: "#047857",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  studentAttBannerScore: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  studentAttBannerPill: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  studentAttBannerPillText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "800",
  },
  studentAttHistorySection: {
    gap: 10,
  },
  studentAttEmptyCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  studentAttEmptyTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "900",
  },
  studentAttEmptyText: {
    color: "#64748b",
    fontSize: 11.5,
    textAlign: "center",
  },
  studentAttRecordList: {
    gap: 8,
  },
  studentAttRecordRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 1,
    flexDirection: "row",
    gap: 12,
    padding: 11,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  studentAttDateBadge: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  studentAttDayNumber: {
    color: "#047857",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 18,
  },
  studentAttMonthText: {
    color: "#059669",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  studentAttRecordDetails: {
    flex: 1,
  },
  studentAttRecordDay: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  studentAttRecordFullDate: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "600",
    marginTop: 2,
  },
  studentAttRecordRemark: {
    color: "#94a3b8",
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 2,
  },
  studentAttStatusPill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  studentAttPillPresent: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  studentAttPillAbsent: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  studentAttPillLate: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  studentAttStatusText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  digitalIdCard: {
    backgroundColor: "#064e3b",
    borderColor: "#059669",
    borderRadius: 22,
    borderWidth: 1,
    elevation: 6,
    overflow: "hidden",
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  digitalIdHeader: {
    alignItems: "center",
    backgroundColor: "#047857",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  digitalIdHeaderLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  digitalIdHeaderLogoWrap: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  digitalIdHeaderLogo: {
    height: 30,
    width: 30,
  },
  digitalIdSchoolName: {
    color: "#ffd15c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  digitalIdSubtitle: {
    color: "#ecfdf5",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  digitalIdChip: {
    backgroundColor: "#ffd15c",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  digitalIdChipText: {
    color: "#064e3b",
    fontSize: 8.5,
    fontWeight: "900",
  },
  digitalIdBody: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  digitalIdAvatarWrap: {
    borderColor: "#ffd15c",
    borderRadius: 999,
    borderWidth: 2,
    height: 68,
    position: "relative",
    width: 68,
  },
  digitalIdAvatar: {
    borderRadius: 999,
    height: 64,
    width: 64,
  },
  digitalIdActiveDot: {
    alignItems: "center",
    backgroundColor: "#10b981",
    borderRadius: 999,
    bottom: 0,
    height: 18,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    width: 18,
  },
  digitalIdStudentInfo: {
    flex: 1,
  },
  digitalIdStudentName: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  digitalIdTagsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  digitalIdTag: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  digitalIdTagText: {
    color: "#ecfdf5",
    fontSize: 10,
    fontWeight: "800",
  },
  digitalIdStudentAdm: {
    color: "#a7f3d0",
    fontSize: 9.5,
    fontWeight: "700",
    marginTop: 4,
  },
  digitalIdBarcodeRow: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  digitalIdBarcodeBars: {
    flex: 1,
  },
  digitalIdBarcodeSymbol: {
    color: "#ffd15c",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  digitalIdBarcodeNumber: {
    color: "#a7f3d0",
    fontSize: 8.5,
    fontWeight: "800",
  },
  profileSectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  profileSectionIconWrap: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  profileMenuList: {
    gap: 8,
  },
  profileMenuItem: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  profileMenuIconWrap: {
    alignItems: "center",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  profileMenuTextWrap: {
    flex: 1,
  },
  profileMenuLabel: {
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "800",
  },
  profileMenuSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  studentLogoutButton: {
    alignItems: "center",
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 14,
  },
  studentLogoutButtonText: {
    color: "#e11d48",
    fontSize: 13,
    fontWeight: "900",
  },
  teacherHeaderBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  teacherHeaderBadgeText: {
    color: "#047857",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  teacherHeaderLogoutBtn: {
    alignItems: "center",
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  teacherHeaderLogoutText: {
    color: "#e11d48",
    fontSize: 10.5,
    fontWeight: "900",
  },
  teacherHeroCard: {
    backgroundColor: "#064e3b",
    borderColor: "#059669",
    borderRadius: 22,
    borderWidth: 1,
    elevation: 6,
    overflow: "hidden",
    padding: 16,
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  teacherHeroCardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  teacherHeroBrandWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    flex: 1,
  },
  teacherHeroLogoWrap: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  teacherHeroLogo: {
    height: 32,
    width: 32,
  },
  teacherHeroSchoolText: {
    flex: 1,
  },
  teacherHeroSchoolName: {
    color: "#ffd15c",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  teacherHeroPortalLabel: {
    color: "#a7f3d0",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  teacherVerifiedBadge: {
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    borderColor: "rgba(167, 243, 208, 0.4)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  teacherVerifiedBadgeText: {
    color: "#ecfdf5",
    fontSize: 9.5,
    fontWeight: "800",
  },
  teacherHeroIdentityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingVertical: 4,
  },
  teacherHeroAvatarBorder: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 999,
    borderWidth: 2,
    height: 62,
    justifyContent: "center",
    position: "relative",
    width: 62,
  },
  teacherHeroAvatarInner: {
    alignItems: "center",
    backgroundColor: "#047857",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  teacherHeroAvatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  teacherHeroStarBadge: {
    alignItems: "center",
    backgroundColor: "#ffd15c",
    borderRadius: 999,
    bottom: -2,
    height: 18,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 18,
  },
  teacherHeroBio: {
    flex: 1,
    minWidth: 0,
  },
  teacherHeroGreeting: {
    color: "#a7f3d0",
    fontSize: 11,
    fontWeight: "700",
  },
  teacherHeroTeacherName: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  teacherHeroPillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  teacherHeroPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  teacherHeroPillText: {
    color: "#ecfdf5",
    fontSize: 10,
    fontWeight: "800",
  },
  teacherHeroCardFooter: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  teacherHeroFooterLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  teacherHeroFooterText: {
    color: "#a7f3d0",
    fontSize: 10,
    fontWeight: "700",
  },
  teacherHeroFooterRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  teacherHeroFooterLink: {
    color: "#ffd15c",
    fontSize: 10,
    fontWeight: "900",
  },
  teacherAttendanceCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    padding: 15,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  teacherCardHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  teacherCardHeaderIcon: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  teacherCardHeaderTitles: {
    flex: 1,
  },
  teacherCardSectionTitle: {
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "900",
  },
  teacherCardSectionMeta: {
    color: "#059669",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  teacherCardHeaderLink: {
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  teacherCardHeaderLinkText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "800",
  },
  teacherAttendanceMeterBlock: {
    backgroundColor: "#f8fafc",
    borderColor: "#f1f5f9",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  teacherAttendanceScoreRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  teacherAttendancePercentWrap: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 6,
  },
  teacherAttendancePercentText: {
    color: "#047857",
    fontSize: 26,
    fontWeight: "900",
  },
  teacherAttendancePercentLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  teacherAttendanceStatusPill: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  teacherAttendanceStatusText: {
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "800",
  },
  teacherProgressBarTrack: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    height: 7,
    overflow: "hidden",
    width: "100%",
  },
  teacherProgressBarFill: {
    backgroundColor: "#10b981",
    borderRadius: 999,
    height: "100%",
  },
  teacherMetricsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  teacherMetricPillCard: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  teacherMetricStudents: {
    backgroundColor: "#f0f9ff",
  },
  teacherMetricPresent: {
    backgroundColor: "#ecfdf5",
  },
  teacherMetricAbsent: {
    backgroundColor: "#fff1f2",
  },
  teacherMetricLate: {
    backgroundColor: "#fffbeb",
  },
  teacherMetricNum: {
    color: "#059669",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  teacherMetricTag: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
    textTransform: "uppercase",
  },
  teacherServicesSection: {
    marginTop: 4,
  },
  teacherServicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  teacherServiceCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 110,
    padding: 13,
    position: "relative",
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  teacherServiceIconWrap: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    marginBottom: 8,
    width: 38,
  },
  teacherServiceBody: {
    flex: 1,
  },
  teacherServiceTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  teacherServiceSubtitle: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 2,
  },
  teacherServiceArrowWrap: {
    bottom: 12,
    position: "absolute",
    right: 12,
  },
  teacherToolsSection: {
    marginTop: 6,
  },
  teacherToolsList: {
    gap: 8,
  },
  teacherToolItem: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  teacherToolIconWrap: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  teacherToolTextWrap: {
    flex: 1,
  },
  teacherToolLabel: {
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "800",
  },
  teacherToolSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  attendanceBulkRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  attendanceBulkLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  attendanceBulkButtons: {
    flexDirection: "row",
    gap: 6,
  },
  attendanceBulkBtn: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  attendanceBulkPresent: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  attendanceBulkAbsent: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  attendanceBulkBtnTextPresent: {
    color: "#047857",
    fontSize: 10.5,
    fontWeight: "800",
  },
  attendanceBulkBtnTextAbsent: {
    color: "#e11d48",
    fontSize: 10.5,
    fontWeight: "800",
  },
  attendanceStudentInfo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  attendanceAvatar: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  attendanceAvatarText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "900",
  },
  marksPanelContainer: {
    paddingBottom: 20,
  },
  marksHeroShell: {
    backgroundColor: "#064e3b",
    borderRadius: 20,
    elevation: 3,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  marksHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  marksHeroBadge: {
    alignItems: "center",
    backgroundColor: "rgba(167, 243, 208, 0.15)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  marksHeroBadgeText: {
    color: "#a7f3d0",
    fontSize: 10.5,
    fontWeight: "800",
  },
  marksHeroTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 8,
  },
  marksHeroSub: {
    color: "#a7f3d0",
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 2,
  },
  marksTerminalPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 14,
  },
  marksTerminalPill: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  marksTerminalPillActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  marksTerminalPillText: {
    color: "#d1fae5",
    fontSize: 11,
    fontWeight: "800",
  },
  marksTerminalPillTextActive: {
    color: "#064e3b",
    fontWeight: "900",
  },
  marksStudentSpotlightCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    padding: 14,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  marksStudentMainRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  marksStudentAvatarWrap: {
    alignItems: "center",
    backgroundColor: "#047857",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  marksStudentAvatarText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  marksStudentInfoCol: {
    flex: 1,
  },
  marksStudentName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  marksStudentTagsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 3,
  },
  marksStudentRollPill: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  marksStudentRollText: {
    color: "#047857",
    fontSize: 10.5,
    fontWeight: "800",
  },
  marksStudentAdmText: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "700",
  },
  marksStepperRow: {
    alignItems: "center",
    borderTopColor: "#f1f5f9",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
  },
  marksStepperBtn: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  marksStepperBtnDisabled: {
    opacity: 0.4,
  },
  marksStepperBtnText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "800",
  },
  marksStepperCounter: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  marksRosterToggle: {
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 7,
  },
  marksRosterToggleText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "800",
  },
  marksRosterSheet: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
  },
  marksRosterSearchInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 12,
    height: 38,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  marksRosterItem: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#f1f5f9",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  marksRosterItemActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  marksRosterItemName: {
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "800",
  },
  marksRosterItemMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
  },
  marksSummaryCard: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  marksSummaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  marksSummaryHeaderTitle: {
    color: "#064e3b",
    fontSize: 12.5,
    fontWeight: "900",
  },
  marksSummaryGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  marksSummaryBox: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d1fae5",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  marksSummaryBoxNum: {
    color: "#047857",
    fontSize: 16,
    fontWeight: "900",
  },
  marksSummaryBoxLabel: {
    color: "#64748b",
    fontSize: 9.5,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  marksItemCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 10,
    padding: 14,
    shadowColor: "#06372b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  marksItemHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  marksItemIconWrap: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  marksItemTitles: {
    flex: 1,
  },
  marksItemName: {
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "900",
  },
  marksItemMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  marksItemScorePill: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  marksItemScoreText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
  },
  marksItemInputRow: {
    flexDirection: "row",
    gap: 10,
  },
  marksItemInputCol: {
    flex: 1,
  },
  marksFieldLabel: {
    color: "#475569",
    fontSize: 10.5,
    fontWeight: "800",
    marginBottom: 4,
  },
  marksInputEnhanced: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
    height: 44,
    paddingHorizontal: 12,
    textAlign: "center",
  },
  marksInputError: {
    backgroundColor: "#fff1f2",
    borderColor: "#f43f5e",
  },
  marksDrawingBanner: {
    backgroundColor: "#fffbeb",
    borderColor: "#fef3c7",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  marksDrawingBannerText: {
    color: "#92400e",
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
  },
  marksNextStudentAction: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  marksNextStudentText: {
    color: "#047857",
    fontSize: 12.5,
    fontWeight: "900",
  },
});

