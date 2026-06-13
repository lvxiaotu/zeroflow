import fs from "node:fs";
import { createRequire } from "node:module";
import type * as Sweph from "sweph";
import tzLookup from "tz-lookup";
import { readEnv } from "./env";
import type {
  AstroChartData,
  BirthChartInput,
  CalculatedNatalChart,
  HouseSystem,
  LunarNodeType,
  NatalChartHouse,
  NatalChartPosition,
  NormalizedBirthChartInput,
  PlanetSet,
  ProviderResult,
  TimezoneSource,
  ZodiacMode
} from "./types";

type PlanetDefinition = {
  id: string;
  swephId: SwephPlanetConstant;
  retrograde: boolean;
  sets: PlanetSet[];
  nodeType?: LunarNodeType;
};

type ParsedLocalDateTime = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

type ResolvedTimezone = {
  dstActive: boolean;
  source: TimezoneSource;
  timezone?: string;
  timezoneOffsetMinutes: number;
};

type HouseCalculation = {
  ascendant: number;
  cusps: number[];
  fallback?: HouseSystem;
  requested: HouseSystem;
  system: HouseSystem;
};

type SiderealMode = {
  id: number;
  key: string;
  label: string;
};

type SwephModule = typeof Sweph;
type SwephPlanetConstant =
  | "SE_SUN"
  | "SE_MOON"
  | "SE_MERCURY"
  | "SE_VENUS"
  | "SE_MARS"
  | "SE_JUPITER"
  | "SE_SATURN"
  | "SE_URANUS"
  | "SE_NEPTUNE"
  | "SE_PLUTO"
  | "SE_MEAN_NODE"
  | "SE_TRUE_NODE"
  | "SE_MEAN_APOG"
  | "SE_CHIRON"
  | "SE_CERES"
  | "SE_PALLAS"
  | "SE_JUNO"
  | "SE_VESTA";

type SwissEphemerisRuntime = {
  engine: string;
  ephemeris: "swiss-files" | "moshier";
  ephemerisPath?: string;
  flags: number;
  notes: string[];
};

const zodiacSigns = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces"
];

const houseSystemCodes: Record<HouseSystem, string> = {
  placidus: "P",
  koch: "K",
  porphyry: "O",
  regiomontanus: "R",
  campanus: "C",
  equal: "E",
  "equal-2": "E",
  "vehlow-equal": "V",
  "whole-sign": "W",
  meridian: "X",
  azimuthal: "H",
  "polich-page": "T",
  alcabitus: "B",
  sripati: "S",
  morinus: "M",
  "equal-mc": "D",
  "carter-poli-equatorial": "F",
  sunshine: "I",
  "sunshine-alt": "i",
  krusinski: "U",
  "pullen-sd": "L",
  "pullen-sr": "Q",
  apc: "Y",
  "savard-a": "J"
};

const siderealModes: Record<string, SiderealMode> = {
  "fagan-bradley": { key: "fagan-bradley", label: "Fagan-Bradley", id: 0 },
  lahiri: { key: "lahiri", label: "Lahiri", id: 1 },
  deluce: { key: "deluce", label: "De Luce", id: 2 },
  raman: { key: "raman", label: "Raman", id: 3 },
  ushashashi: { key: "ushashashi", label: "Ushashashi", id: 4 },
  krishnamurti: { key: "krishnamurti", label: "Krishnamurti", id: 5 },
  "djwhal-khul": { key: "djwhal-khul", label: "Djwhal Khul", id: 6 },
  yukteshwar: { key: "yukteshwar", label: "Yukteshwar", id: 7 },
  "jn-bhasin": { key: "jn-bhasin", label: "JN Bhasin", id: 8 },
  "babyl-kugler1": { key: "babyl-kugler1", label: "Babylonian Kugler 1", id: 9 },
  "babyl-kugler2": { key: "babyl-kugler2", label: "Babylonian Kugler 2", id: 10 },
  "babyl-kugler3": { key: "babyl-kugler3", label: "Babylonian Kugler 3", id: 11 },
  "babyl-huber": { key: "babyl-huber", label: "Babylonian Huber", id: 12 },
  "babyl-etpsc": { key: "babyl-etpsc", label: "Babylonian ETPSC", id: 13 },
  "aldebaran-15tau": { key: "aldebaran-15tau", label: "Aldebaran 15 Taurus", id: 14 },
  hipparchos: { key: "hipparchos", label: "Hipparchos", id: 15 },
  sassanian: { key: "sassanian", label: "Sassanian", id: 16 },
  "galcent-0sag": { key: "galcent-0sag", label: "Galactic Center 0 Sagittarius", id: 17 },
  j2000: { key: "j2000", label: "J2000", id: 18 },
  j1900: { key: "j1900", label: "J1900", id: 19 },
  b1950: { key: "b1950", label: "B1950", id: 20 },
  suryasiddhanta: { key: "suryasiddhanta", label: "Suryasiddhanta", id: 21 },
  "suryasiddhanta-msun": { key: "suryasiddhanta-msun", label: "Suryasiddhanta Mean Sun", id: 22 },
  aryabhata: { key: "aryabhata", label: "Aryabhata", id: 23 },
  "aryabhata-msun": { key: "aryabhata-msun", label: "Aryabhata Mean Sun", id: 24 },
  "ss-revati": { key: "ss-revati", label: "SS Revati", id: 25 },
  "ss-citra": { key: "ss-citra", label: "SS Citra", id: 26 },
  "true-citra": { key: "true-citra", label: "True Citra", id: 27 },
  "true-revati": { key: "true-revati", label: "True Revati", id: 28 },
  "true-pushya": { key: "true-pushya", label: "True Pushya", id: 29 },
  "galcent-rgilbrand": { key: "galcent-rgilbrand", label: "Galactic Center Gil Brand", id: 30 },
  "galequ-iau1958": { key: "galequ-iau1958", label: "Galactic Equator IAU 1958", id: 31 },
  "galequ-true": { key: "galequ-true", label: "Galactic Equator True", id: 32 },
  "galequ-mula": { key: "galequ-mula", label: "Galactic Equator Mula", id: 33 },
  "galalign-mardyks": { key: "galalign-mardyks", label: "Galactic Alignment Mardyks", id: 34 },
  "true-mula": { key: "true-mula", label: "True Mula", id: 35 },
  "galcent-mula-wilhelm": { key: "galcent-mula-wilhelm", label: "Galactic Center Mula Wilhelm", id: 36 },
  "aryabhata-522": { key: "aryabhata-522", label: "Aryabhata 522", id: 37 },
  "babyl-britton": { key: "babyl-britton", label: "Babylonian Britton", id: 38 },
  "true-sheoran": { key: "true-sheoran", label: "True Sheoran", id: 39 },
  "galcent-cochrane": { key: "galcent-cochrane", label: "Galactic Center Cochrane", id: 40 },
  "galequ-fiorenza": { key: "galequ-fiorenza", label: "Galactic Equator Fiorenza", id: 41 },
  "valens-moon": { key: "valens-moon", label: "Valens Moon", id: 42 },
  "lahiri-1940": { key: "lahiri-1940", label: "Lahiri 1940", id: 43 },
  "lahiri-vp285": { key: "lahiri-vp285", label: "Lahiri VP285", id: 44 },
  "krishnamurti-vp291": { key: "krishnamurti-vp291", label: "Krishnamurti VP291", id: 45 },
  "lahiri-icrc": { key: "lahiri-icrc", label: "Lahiri ICRC", id: 46 }
};

const planetDefinitions: PlanetDefinition[] = [
  { id: "Sun", swephId: "SE_SUN", retrograde: false, sets: ["classical", "modern", "extended"] },
  { id: "Moon", swephId: "SE_MOON", retrograde: false, sets: ["classical", "modern", "extended"] },
  {
    id: "Mercury",
    swephId: "SE_MERCURY",
    retrograde: true,
    sets: ["classical", "modern", "extended"]
  },
  { id: "Venus", swephId: "SE_VENUS", retrograde: true, sets: ["classical", "modern", "extended"] },
  { id: "Mars", swephId: "SE_MARS", retrograde: true, sets: ["classical", "modern", "extended"] },
  {
    id: "Jupiter",
    swephId: "SE_JUPITER",
    retrograde: true,
    sets: ["classical", "modern", "extended"]
  },
  {
    id: "Saturn",
    swephId: "SE_SATURN",
    retrograde: true,
    sets: ["classical", "modern", "extended"]
  },
  { id: "Uranus", swephId: "SE_URANUS", retrograde: true, sets: ["modern", "extended"] },
  { id: "Neptune", swephId: "SE_NEPTUNE", retrograde: true, sets: ["modern", "extended"] },
  { id: "Pluto", swephId: "SE_PLUTO", retrograde: true, sets: ["modern", "extended"] },
  { id: "Chiron", swephId: "SE_CHIRON", retrograde: true, sets: ["extended"] },
  { id: "Lilith", swephId: "SE_MEAN_APOG", retrograde: true, sets: ["extended"] },
  { id: "Ceres", swephId: "SE_CERES", retrograde: true, sets: ["extended"] },
  { id: "Pallas", swephId: "SE_PALLAS", retrograde: true, sets: ["extended"] },
  { id: "Juno", swephId: "SE_JUNO", retrograde: true, sets: ["extended"] },
  { id: "Vesta", swephId: "SE_VESTA", retrograde: true, sets: ["extended"] },
  {
    id: "NNode",
    swephId: "SE_MEAN_NODE",
    retrograde: true,
    sets: ["classical", "modern", "extended"],
    nodeType: "mean"
  },
  {
    id: "TrueNode",
    swephId: "SE_TRUE_NODE",
    retrograde: true,
    sets: ["classical", "modern", "extended"],
    nodeType: "true"
  }
];

const require = createRequire(import.meta.url);
let configuredEphemerisPath: string | undefined;
let configuredJplFile: string | undefined;
let swephRuntime: SwephModule | undefined;

export function calculateNatalChart(
  input: BirthChartInput
): ProviderResult<CalculatedNatalChart> {
  const birth = normalizeBirthInput(input);
  const utcDate = new Date(birth.utcIso);
  const runtime = getSwissEphemerisRuntime();
  const { jdUt } = utcDateToJulianDays(utcDate);
  const siderealMode = birth.zodiacMode === "sidereal" ? getSiderealMode(birth.siderealAyanamsa) : undefined;
  const calculationFlags = getCalculationFlags(runtime, birth.zodiacMode);
  const positionNotes: string[] = [];

  applySiderealMode(siderealMode);

  const positions = getPlanetDefinitionsForBirth(birth).flatMap((planet) => {
    try {
      return [planetPositionFromSwissEphemeris(planet, jdUt, calculationFlags)];
    } catch (error) {
      if (birth.planetSet === "extended" && planet.sets.length === 1 && planet.sets[0] === "extended") {
        positionNotes.push(
          `${planet.id} skipped because the active ephemeris could not calculate it: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
      }

      throw error;
    }
  });
  const planets = positions.reduce<AstroChartData["planets"]>((accumulator, position) => {
    accumulator[position.id] = position.retrograde
      ? [position.longitude, -1]
      : [position.longitude];
    return accumulator;
  }, {});
  const houseData = calculateSwissHouses({
    birth,
    jdUt
  });
  const houses = houseData.cusps.map<NatalChartHouse>((longitude, index) => ({
    house: index + 1,
    longitude,
    sign: signForLongitude(longitude),
    degreeInSign: degreeInSign(longitude)
  }));
  const obliquity = calculateObliquity(jdUt, runtime);
  const siderealTimeDeg = roundDegrees(getSweph().sidtime(jdUt) * 15 + birth.longitude);
  const ayanamsaDeg =
    birth.zodiacMode === "sidereal" ? roundDegrees(getSweph().get_ayanamsa_ut(jdUt)) : undefined;
  const notes = [
    ...runtime.notes,
    `Timezone offset resolved from ${birth.timezoneSource}${birth.timezone ? ` (${birth.timezone})` : ""}.`,
    `Zodiac mode: ${birth.zodiacMode}${siderealMode ? ` / ${siderealMode.label}` : ""}.`,
    `Planet set: ${birth.planetSet}; lunar node: ${birth.nodeType}.`,
    "Planet longitudes and retrograde states use Swiss Ephemeris calc_ut with daily speed.",
    `House cusps use Swiss Ephemeris ${houseData.system} house system (${houseSystemCodes[houseData.system]}).`,
    "House calculations fall back to Porphyry at extreme latitudes when the requested system is mathematically unavailable.",
    ...positionNotes
  ];

  if (houseData.fallback) {
    notes.push(`Requested ${houseData.requested} houses fell back to ${houseData.fallback}.`);
  }

  if (birth.dstActive) {
    notes.push("Daylight saving time appears active for the resolved timezone/date.");
  }

  if (Math.abs(birth.latitude) > 66.5) {
    notes.push("High-latitude births can produce unstable ascendant/house results.");
  }

  return {
    provider: "swiss-ephemeris",
    usedMock: false,
    data: {
      chartData: {
        planets,
        cusps: houseData.cusps
      },
      birth: {
        ...birth,
        ayanamsaDeg,
        siderealAyanamsaId: siderealMode?.id
      },
      positions,
      houses,
      calculation: {
        engine: runtime.engine,
        ephemeris: runtime.ephemeris,
        ephemerisPath: runtime.ephemerisPath,
        houseSystem: houseData.system,
        requestedHouseSystem: houseData.requested,
        houseSystemFallback: houseData.fallback,
        zodiacMode: birth.zodiacMode,
        siderealAyanamsa: siderealMode?.key,
        siderealAyanamsaId: siderealMode?.id,
        ayanamsaDeg,
        planetSet: birth.planetSet,
        nodeType: birth.nodeType,
        timezone: birth.timezone,
        timezoneSource: birth.timezoneSource,
        dstActive: birth.dstActive,
        utcIso: birth.utcIso,
        ascendant: houseData.ascendant,
        obliquity,
        siderealTimeDeg,
        notes
      }
    }
  };
}

export function getSwissEphemerisRuntime(): SwissEphemerisRuntime {
  const ephemerisPath = readEnv("SWISS_EPHEMERIS_PATH") ?? readEnv("SWEPH_EPHE_PATH");
  const validEphemerisPath = ephemerisPath && fs.existsSync(ephemerisPath) ? ephemerisPath : undefined;
  const jplFile = readEnv("SWISS_EPHEMERIS_JPL_FILE") ?? readEnv("HOROSA_SWISSEPH_JPL_FILE");
  const validJplFile = jplFile && fs.existsSync(jplFile) ? jplFile : undefined;
  const sweph = getSweph();
  const libraryVersion = sweph.version();
  const requestedMode = (
    readEnv("SWISS_EPHEMERIS_MODE") ??
    readEnv("HOROSA_SWISSEPH_MODE") ??
    (validEphemerisPath ? "SWIEPH" : "MOSEPH")
  ).toUpperCase();

  if (validEphemerisPath && configuredEphemerisPath !== validEphemerisPath) {
    sweph.set_ephe_path(validEphemerisPath);
    configuredEphemerisPath = validEphemerisPath;
  }

  if (validJplFile && configuredJplFile !== validJplFile && "set_jpl_file" in sweph) {
    (sweph as SwephModule & { set_jpl_file: (file: string) => void }).set_jpl_file(validJplFile);
    configuredJplFile = validJplFile;
  }

  if (validJplFile && requestedMode === "JPL") {
    return {
      engine: `Swiss Ephemeris ${libraryVersion} (JPL)`,
      ephemeris: "swiss-files",
      ephemerisPath: validEphemerisPath,
      flags: sweph.constants.SEFLG_JPLEPH | sweph.constants.SEFLG_SPEED,
      notes: [`Using JPL ephemeris file ${validJplFile}.`]
    };
  }

  if (validEphemerisPath && requestedMode !== "MOSEPH") {
    return {
      engine: `Swiss Ephemeris ${libraryVersion}`,
      ephemeris: "swiss-files",
      ephemerisPath: validEphemerisPath,
      flags: sweph.constants.SEFLG_SWIEPH | sweph.constants.SEFLG_SPEED,
      notes: [`Using Swiss Ephemeris files from ${validEphemerisPath}.`]
    };
  }

  return {
    engine: `Swiss Ephemeris ${libraryVersion} (Moshier fallback)`,
    ephemeris: "moshier",
    flags: sweph.constants.SEFLG_MOSEPH | sweph.constants.SEFLG_SPEED,
    notes: ephemerisPath
      ? [
          `SWISS_EPHEMERIS_PATH was set to ${ephemerisPath}, but usable Swiss files were not found; using Moshier fallback.`
        ]
      : [
          "SWISS_EPHEMERIS_PATH is not set; using Swiss Ephemeris Moshier fallback without external ephemeris files."
        ]
  };
}

function getSweph() {
  swephRuntime ??= require("sweph") as SwephModule;
  return swephRuntime;
}

function normalizeBirthInput(input: BirthChartInput): NormalizedBirthChartInput {
  const parsed = parseLocalDateTime(input.date, input.time);

  assertFiniteInRange(input.latitude, -89.999, 89.999, "latitude");
  assertFiniteInRange(input.longitude, -180, 180, "longitude");

  const timezone = resolveBirthTimezone(input, parsed);
  const utcMs =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0, 0) -
    timezone.timezoneOffsetMinutes * 60 * 1000;
  const utcDate = new Date(utcMs);

  if (Number.isNaN(utcDate.getTime())) {
    throw new Error("birth date/time cannot be converted to UTC");
  }

  const zodiacMode = normalizeZodiacMode(input.zodiacMode);
  const siderealMode = zodiacMode === "sidereal" ? getSiderealMode(input.siderealAyanamsa) : undefined;

  return {
    ...input,
    houseSystem: normalizeHouseSystem(input.houseSystem),
    timezone: timezone.timezone,
    timezoneOffsetMinutes: timezone.timezoneOffsetMinutes,
    timezoneSource: timezone.source,
    dstActive: timezone.dstActive,
    latitude: roundCoordinate(input.latitude),
    longitude: roundCoordinate(input.longitude),
    utcIso: utcDate.toISOString(),
    zodiacMode,
    siderealAyanamsa: siderealMode?.key,
    siderealAyanamsaId: siderealMode?.id,
    planetSet: normalizePlanetSet(input.planetSet),
    nodeType: normalizeNodeType(input.nodeType)
  };
}

function parseLocalDateTime(date: string, time: string): ParsedLocalDateTime {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

  if (!dateMatch) {
    throw new Error("birth date must use YYYY-MM-DD");
  }

  if (!timeMatch) {
    throw new Error("birth time must use HH:mm");
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const validationDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    throw new Error("birth date/time is out of range");
  }

  return { day, hour, minute, month, year };
}

function resolveBirthTimezone(
  input: BirthChartInput,
  parsed: ParsedLocalDateTime
): ResolvedTimezone {
  const localMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0, 0);
  const inputTimezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
  const inferredTimezone = inputTimezone || timezoneAtCoordinates(input.latitude, input.longitude);
  const timezone = inferredTimezone || undefined;

  if (timezone) {
    const timezoneOffsetMinutes = offsetForLocalTime(timezone, localMs, input.timezoneOffsetMinutes);

    return {
      dstActive: isDstActiveAt(timezone, parsed.year, timezoneOffsetMinutes),
      source: inputTimezone ? "input-timezone" : "coordinates",
      timezone,
      timezoneOffsetMinutes
    };
  }

  if (input.timezoneOffsetMinutes !== undefined) {
    assertFiniteInRange(input.timezoneOffsetMinutes, -720, 840, "timezoneOffsetMinutes");

    return {
      dstActive: false,
      source: "manual-offset",
      timezoneOffsetMinutes: Math.round(input.timezoneOffsetMinutes)
    };
  }

  throw new Error("birth timezone could not be resolved from timezone, coordinates, or offset");
}

function timezoneAtCoordinates(latitude: number, longitude: number) {
  try {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      return undefined;
    }

    return tzLookup(latitude, longitude);
  } catch {
    return undefined;
  }
}

function offsetForLocalTime(
  timezone: string,
  localMs: number,
  initialOffsetMinutes: number | undefined
) {
  let offsetMinutes =
    initialOffsetMinutes !== undefined
      ? Math.round(initialOffsetMinutes)
      : offsetForUtcInstant(timezone, new Date(localMs));

  for (let index = 0; index < 4; index += 1) {
    const utcDate = new Date(localMs - offsetMinutes * 60 * 1000);
    const nextOffsetMinutes = offsetForUtcInstant(timezone, utcDate);

    if (nextOffsetMinutes === offsetMinutes) {
      return offsetMinutes;
    }

    offsetMinutes = nextOffsetMinutes;
  }

  return offsetMinutes;
}

function offsetForUtcInstant(timezone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset"
  });
  const timezoneName = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT\s*([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(timezoneName ?? "");

  if (!match) {
    if (/^GMT$/i.test(timezoneName ?? "")) {
      return 0;
    }

    throw new Error(`could not resolve UTC offset for timezone ${timezone}`);
  }

  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  const sign = match[1] === "-" ? -1 : 1;

  return sign * (hours * 60 + minutes);
}

function isDstActiveAt(timezone: string, year: number, offsetMinutes: number) {
  const januaryOffset = offsetForUtcInstant(timezone, new Date(Date.UTC(year, 0, 15, 12, 0, 0)));
  const julyOffset = offsetForUtcInstant(timezone, new Date(Date.UTC(year, 6, 15, 12, 0, 0)));

  if (januaryOffset === julyOffset) {
    return false;
  }

  return offsetMinutes === Math.max(januaryOffset, julyOffset);
}

function utcDateToJulianDays(date: Date) {
  const sweph = getSweph();
  const result = sweph.utc_to_jd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds() + date.getUTCMilliseconds() / 1000,
    sweph.constants.SE_GREG_CAL
  );

  if (result.flag !== sweph.constants.OK) {
    throw new Error(result.error || "Swiss Ephemeris could not convert birth time to Julian day");
  }

  return {
    jdEt: result.data[0],
    jdUt: result.data[1]
  };
}

function planetPositionFromSwissEphemeris(
  planet: PlanetDefinition,
  jdUt: number,
  flags: number
): NatalChartPosition {
  const sweph = getSweph();
  const result = sweph.calc_ut(jdUt, sweph.constants[planet.swephId], flags);

  if (result.flag === sweph.constants.ERR) {
    throw new Error(result.error || `Swiss Ephemeris could not calculate ${planet.id}`);
  }

  const longitude = roundDegrees(result.data[0]);

  return {
    id: planet.id,
    longitude,
    sign: signForLongitude(longitude),
    degreeInSign: degreeInSign(longitude),
    retrograde: planet.retrograde && result.data[3] < 0
  };
}

function calculateSwissHouses({ birth, jdUt }: { birth: NormalizedBirthChartInput; jdUt: number }) {
  const requestedHouseSystem = birth.houseSystem;
  const result = runHouseCalculation(jdUt, birth, requestedHouseSystem);

  if (result) {
    return result;
  }

  if (requestedHouseSystem !== "porphyry") {
    const fallback = runHouseCalculation(jdUt, birth, "porphyry");

    if (fallback) {
      return {
        ...fallback,
        fallback: "porphyry" as const,
        requested: requestedHouseSystem
      };
    }
  }

  throw new Error("Swiss Ephemeris could not calculate houses");
}

function runHouseCalculation(
  jdUt: number,
  birth: NormalizedBirthChartInput,
  houseSystem: HouseSystem
): HouseCalculation | undefined {
  const sweph = getSweph();
  const houseFlags = birth.zodiacMode === "sidereal" ? sweph.constants.SEFLG_SIDEREAL : 0;
  let result: ReturnType<SwephModule["houses_ex2"]>;

  try {
    result = sweph.houses_ex2(
      jdUt,
      houseFlags,
      birth.latitude,
      birth.longitude,
      houseSystemCodes[houseSystem]
    );
  } catch {
    return undefined;
  }

  if (result.flag !== sweph.constants.OK) {
    return undefined;
  }

  const cusps = Array.from(result.data.houses).slice(0, 12).map(roundDegrees);
  const ascendant = roundDegrees(result.data.points[sweph.constants.SE_ASC]);

  if (cusps.length !== 12) {
    return undefined;
  }

  return {
    ascendant,
    cusps,
    requested: houseSystem,
    system: houseSystem
  };
}

function calculateObliquity(jdUt: number, runtime: SwissEphemerisRuntime) {
  const sweph = getSweph();
  const result = sweph.calc_ut(jdUt, sweph.constants.SE_ECL_NUT, runtime.flags);

  if (result.flag === sweph.constants.ERR) {
    return 0;
  }

  return roundDegrees(result.data[0]);
}

function getPlanetDefinitionsForBirth(birth: NormalizedBirthChartInput) {
  return planetDefinitions.filter((planet) => {
    if (!planet.sets.includes(birth.planetSet)) {
      return false;
    }

    if (!planet.nodeType) {
      return true;
    }

    return birth.nodeType === "both" || birth.nodeType === planet.nodeType;
  });
}

function getCalculationFlags(runtime: SwissEphemerisRuntime, zodiacMode: ZodiacMode) {
  const sweph = getSweph();
  return zodiacMode === "sidereal"
    ? runtime.flags | sweph.constants.SEFLG_SIDEREAL
    : runtime.flags;
}

function applySiderealMode(mode: SiderealMode | undefined) {
  const sweph = getSweph();

  if (!mode) {
    return;
  }

  sweph.set_sid_mode(mode.id, 0, 0);
}

function getSiderealMode(value: string | undefined): SiderealMode {
  const key = normalizeKey(value);
  return siderealModes[key] ?? { key: "lahiri", label: "Lahiri", id: 1 };
}

function normalizeHouseSystem(value: unknown): HouseSystem {
  const key = normalizeKey(value);
  return key in houseSystemCodes ? (key as HouseSystem) : "equal";
}

function normalizePlanetSet(value: unknown): PlanetSet {
  if (value === "classical" || value === "modern" || value === "extended") {
    return value;
  }

  return "modern";
}

function normalizeNodeType(value: unknown): LunarNodeType {
  if (value === "mean" || value === "true" || value === "both") {
    return value;
  }

  return "mean";
}

function normalizeZodiacMode(value: unknown): ZodiacMode {
  return value === "sidereal" ? "sidereal" : "tropical";
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function signForLongitude(longitude: number) {
  return zodiacSigns[Math.floor(normalizeDegrees(longitude) / 30)] ?? "Aries";
}

function degreeInSign(longitude: number) {
  return roundDegrees(normalizeDegrees(longitude) % 30);
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function roundDegrees(value: number) {
  return Math.round(normalizeDegrees(value) * 100) / 100;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function assertFiniteInRange(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
}
