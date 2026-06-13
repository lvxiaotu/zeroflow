export const defaultTargetDurationSec = 60;
export const storyboardStructureThresholdSec = 180;

export const targetDurationOptions = [
  { value: 30, label: "30 秒" },
  { value: 60, label: "60 秒" },
  { value: 90, label: "90 秒" },
  { value: 180, label: "3 分钟" },
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

export function getDefaultChapterCount(targetDurationSec: number) {
  if (targetDurationSec <= 60) return 1;
  if (targetDurationSec <= 120) return 2;
  if (targetDurationSec <= 180) return 3;
  if (targetDurationSec <= 300) return 5;
  if (targetDurationSec <= 900) return 7;
  return 10;
}

export function getDefaultSceneCount(targetDurationSec: number) {
  if (targetDurationSec <= 30) return 4;
  if (targetDurationSec <= 60) return 5;
  if (targetDurationSec <= 90) return 8;
  if (targetDurationSec <= 180) return 10;
  if (targetDurationSec <= 300) return 16;
  if (targetDurationSec <= 900) return 36;
  return 60;
}

export function getDefaultChapterSceneCount(chapterDurationSec: number) {
  if (chapterDurationSec <= 30) return 3;
  if (chapterDurationSec <= 120) return 5;
  if (chapterDurationSec <= 180) return 6;
  if (chapterDurationSec <= 300) return 8;
  return 10;
}
