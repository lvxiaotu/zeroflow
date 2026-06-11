import type { SceneSpec } from "@zeroflow/core";

export type ProviderResult<T> = {
  provider: string;
  usedMock: boolean;
  data: T;
  raw?: unknown;
};

export type ProviderHealth = {
  id: "deepseek" | "yunwu" | "runninghub" | "astrochart";
  label: string;
  configured: boolean;
  ready: boolean;
  status: "ready" | "not-configured" | "needs-input" | "unavailable";
  details?: string;
};

export type GeneratedScript = {
  title: string;
  hook: string;
  scriptText: string;
  tone: string;
  targetDurationSec: number;
};

export type GeneratedStoryboard = {
  scenes: Array<{
    title: string;
    description: string;
    narration: string;
    sceneType: SceneSpec["type"];
    durationSec: number;
    visualPrompt?: string;
    caption?: string;
  }>;
};

export type LlmProvider = {
  generateScript(input: {
    topic: string;
    model?: string;
    targetDurationSec?: number;
    tone?: string;
    audience?: string;
  }): Promise<ProviderResult<GeneratedScript>>;
  generateStoryboard(input: {
    scriptText: string;
    sceneCount: number;
    model?: string;
    targetDurationSec?: number;
  }): Promise<ProviderResult<GeneratedStoryboard>>;
};

export type ImageProvider = {
  generateImage(input: {
    prompt: string;
    model?: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024";
    outputPath?: string;
  }): Promise<
    ProviderResult<{
      assetPath?: string;
      url?: string;
      b64Json?: string;
      prompt: string;
    }>
  >;
};

export type TtsProvider = {
  generateVoiceover(input: {
    text: string;
    outputPath: string;
    referenceAudioPath?: string;
    referenceAudioName?: string;
    chunkMax?: number;
    pauseMs?: number;
    dryRun?: boolean;
  }): Promise<
    ProviderResult<{
      audioPath: string;
      manifestPath?: string;
      stdout: string;
      stderr: string;
    }>
  >;
};

export type AstroChartData = {
  planets: Record<string, number[]>;
  cusps: number[];
};

export type HouseSystem = "equal";

export type BirthChartInput = {
  date: string;
  time: string;
  timezoneOffsetMinutes: number;
  latitude: number;
  longitude: number;
  placeName?: string;
  label?: string;
  houseSystem?: HouseSystem;
};

export type NormalizedBirthChartInput = BirthChartInput & {
  utcIso: string;
  houseSystem: HouseSystem;
};

export type NatalChartPosition = {
  id: string;
  longitude: number;
  sign: string;
  degreeInSign: number;
  retrograde: boolean;
};

export type NatalChartHouse = {
  house: number;
  longitude: number;
  sign: string;
  degreeInSign: number;
};

export type CalculatedNatalChart = {
  chartData: AstroChartData;
  birth: NormalizedBirthChartInput;
  positions: NatalChartPosition[];
  houses: NatalChartHouse[];
  calculation: {
    engine: string;
    houseSystem: HouseSystem;
    utcIso: string;
    ascendant: number;
    obliquity: number;
    siderealTimeDeg: number;
    notes: string[];
  };
};

export type ChartProvider = {
  calculateNatalChart(input: BirthChartInput): Promise<ProviderResult<CalculatedNatalChart>>;
  renderNatalChart(input: {
    birth?: BirthChartInput;
    data?: AstroChartData;
    outputPath: string;
    width?: number;
    height?: number;
    highlight?: string;
  }): Promise<
    ProviderResult<{
      assetPath: string;
      svg: string;
      data: AstroChartData;
      birth?: NormalizedBirthChartInput;
      positions?: NatalChartPosition[];
      houses?: NatalChartHouse[];
      calculation?: CalculatedNatalChart["calculation"];
      usedSampleData: boolean;
      source: "provided-data" | "calculated-birth" | "sample";
    }>
  >;
};

export type ProviderRegistry = {
  llm: LlmProvider;
  image: ImageProvider;
  tts: TtsProvider;
  chart: ChartProvider;
};
