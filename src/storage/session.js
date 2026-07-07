import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "sps_mobile_session";
const SAVED_LOGIN_KEY = "sps_mobile_saved_login";

export const loadSession = async () => {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
};

export const saveSession = async (session) => {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = async () => {
  await AsyncStorage.removeItem(SESSION_KEY);
};

const readSavedLogins = async () => {
  const raw = await AsyncStorage.getItem(SAVED_LOGIN_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    await AsyncStorage.removeItem(SAVED_LOGIN_KEY);
    return {};
  }
};

export const loadSavedLogin = async (role) => {
  const savedLogins = await readSavedLogins();
  return savedLogins?.[role] || null;
};

export const saveSavedLogin = async (role, credentials) => {
  const savedLogins = await readSavedLogins();
  savedLogins[role] = {
    identity: String(credentials?.identity || "").trim(),
    password: String(credentials?.password || ""),
    savedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(savedLogins));
};

export const clearSavedLogin = async (role) => {
  const savedLogins = await readSavedLogins();
  delete savedLogins[role];

  if (Object.keys(savedLogins).length === 0) {
    await AsyncStorage.removeItem(SAVED_LOGIN_KEY);
    return;
  }

  await AsyncStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(savedLogins));
};
