const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const HOSTED_API_BASE_URL = "https://starpublicschool.onrender.com";

export const getDefaultApiBaseUrl = () => {
  const envUrl = trimTrailingSlash(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (envUrl) return envUrl;

  return HOSTED_API_BASE_URL;
};

export const API_BASE_URL = getDefaultApiBaseUrl();

export const buildQuery = (params = {}) => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return query ? `?${query}` : "";
};

const getMessage = (data, fallback) => {
  if (typeof data === "string") return data;
  return data?.message || data?.error || fallback;
};

const normalizeError = (error, fallback = "Request failed") => {
  const raw = String(error?.message || fallback);
  const text = raw.toLowerCase();

  if (text.includes("network request failed") || text.includes("failed to fetch")) {
    return "Backend se connection nahi ho pa raha. API URL aur server status check karein.";
  }

  if (text.includes("jwt") || text.includes("token") || error?.status === 401) {
    return "Session expire ho gaya hai. Please dobara login karein.";
  }

  if (text.includes("teacher is not assigned")) {
    return "Aapko abhi class/section assign nahi hua hai. Admin se assignment karwayein.";
  }

  return raw;
};

export const request = async (path, options = {}) => {
  const {
    method = "GET",
    token,
    body,
    params,
    timeoutMs = 20000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${API_BASE_URL}${path}${buildQuery(params)}`;

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = getMessage(data, `Request failed with ${response.status}`);
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  } finally {
    clearTimeout(timer);
  }
};

export const loginTeacher = (email, password) =>
  request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

export const loginStudent = (username, password) =>
  request("/api/student-auth/login", {
    method: "POST",
    body: { username, password },
  });

export const refreshTeacherToken = (refreshToken) =>
  request("/api/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });

export const getAttendanceBootstrap = (token) =>
  request("/api/attendance/bootstrap", { token });

export const getStudents = (token, params = {}) =>
  request("/api/students", { token, params });

export const getSubjectsForClass = (token, classValue, section = "") =>
  request(`/api/subjects/class/${encodeURIComponent(classValue)}`, {
    token,
    params: { section },
  });

export const submitMarks = (token, payload) =>
  request("/api/marks/submit", {
    method: "POST",
    token,
    body: payload,
  });

export const getMarks = (token, params = {}) =>
  request("/api/marks", {
    token,
    params,
  });

export const getAttendanceRecords = (token, params = {}) =>
  request("/api/attendance/records", { token, params });

export const getHolidayCalendar = (token, params = {}) =>
  request("/api/attendance/holidays", { token, params });

export const saveAttendance = (token, payload) =>
  request("/api/attendance/records", {
    method: "POST",
    token,
    body: payload,
  });

export const getStudentAttendance = (token, studentId) =>
  request(`/api/attendance/students/${encodeURIComponent(studentId)}`, { token });
