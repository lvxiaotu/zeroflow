export const defaultTargetDurationSec = 60;

export const targetDurationOptions = [
  { value: 30, label: "30 秒" },
  { value: 60, label: "60 秒" },
  { value: 300, label: "5 分钟" },
  { value: 900, label: "15 分钟" },
  { value: 1800, label: "30 分钟" }
];

export function getTargetDurationSec(value: unknown) {
  const duration = typeof value === "number" ? value : Number(value);

  return targetDurationOptions.some((option) => option.value === duration)
    ? duration
    : defaultTargetDurationSec;
}
