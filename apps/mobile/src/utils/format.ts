export const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

export const formatPercent = (value: number | undefined): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${Math.round(value * 100)}%`;
};

export const boolLabel = (value: boolean): string => (value ? "Yes" : "No");
