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

export type D3DiagramKind = "timeline" | "relationship" | "tree" | "distribution";

export type GeneratedD3Contract = {
  title: string;
  description: string;
  narration: string;
  diagram: D3DiagramKind;
  visualPreset?: D3DiagramKind;
  durationSec?: number;
  data?: unknown;
  dataJson?: string;
};

export type LlmProvider = {
  generateScript(input: {
    topic: string;
    model?: string;
    scriptProfileId?: string;
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
  generateD3Contract(input: {
    prompt: string;
    title?: string;
    description?: string;
    narration?: string;
    diagram?: D3DiagramKind;
    durationSec?: number;
    model?: string;
  }): Promise<ProviderResult<GeneratedD3Contract>>;
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
      model?: string;
      size?: "1024x1024" | "1024x1536" | "1536x1024";
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

export type HouseSystem =
  | "placidus"
  | "koch"
  | "porphyry"
  | "regiomontanus"
  | "campanus"
  | "equal"
  | "equal-2"
  | "vehlow-equal"
  | "whole-sign"
  | "meridian"
  | "azimuthal"
  | "polich-page"
  | "alcabitus"
  | "sripati"
  | "morinus"
  | "equal-mc"
  | "carter-poli-equatorial"
  | "sunshine"
  | "sunshine-alt"
  | "krusinski"
  | "pullen-sd"
  | "pullen-sr"
  | "apc"
  | "savard-a";

export type ZodiacMode = "tropical" | "sidereal";
export type PlanetSet = "classical" | "modern" | "extended";
export type LunarNodeType = "mean" | "true" | "both";
export type TimezoneSource = "input-timezone" | "coordinates" | "manual-offset";

export type BirthChartInput = {
  date: string;
  time: string;
  timezoneOffsetMinutes?: number;
  timezone?: string;
  latitude: number;
  longitude: number;
  placeName?: string;
  label?: string;
  houseSystem?: HouseSystem;
  zodiacMode?: ZodiacMode;
  siderealAyanamsa?: string;
  planetSet?: PlanetSet;
  nodeType?: LunarNodeType;
};

export type NormalizedBirthChartInput = BirthChartInput & {
  utcIso: string;
  timezoneOffsetMinutes: number;
  timezone?: string;
  timezoneSource: TimezoneSource;
  dstActive: boolean;
  houseSystem: HouseSystem;
  zodiacMode: ZodiacMode;
  siderealAyanamsa?: string;
  siderealAyanamsaId?: number;
  ayanamsaDeg?: number;
  planetSet: PlanetSet;
  nodeType: LunarNodeType;
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
    ephemeris: "swiss-files" | "moshier";
    ephemerisPath?: string;
    houseSystem: HouseSystem;
    requestedHouseSystem: HouseSystem;
    houseSystemFallback?: HouseSystem;
    zodiacMode: ZodiacMode;
    siderealAyanamsa?: string;
    siderealAyanamsaId?: number;
    ayanamsaDeg?: number;
    planetSet: PlanetSet;
    nodeType: LunarNodeType;
    timezone?: string;
    timezoneSource: TimezoneSource;
    dstActive: boolean;
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
