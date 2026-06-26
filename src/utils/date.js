export const todayIso = () => new Date().toISOString().slice(0, 10);

export const monthIso = () => new Date().toISOString().slice(0, 7);

export const getDefaultAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return `${currentYear}-${String(currentYear + 1).slice(-2)}`;
};

export const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
