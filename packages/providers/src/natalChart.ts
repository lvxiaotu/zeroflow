import { Body, EclipticLongitude, MakeTime, SiderealTime, SunPosition, e_tilt } from "astronomy-engine";
import type {
  AstroChartData,
  BirthChartInput,
  CalculatedNatalChart,
  NatalChartHouse,
  NatalChartPosition,
  NormalizedBirthChartInput,
  ProviderResult
} from "./types";

type PlanetDefinition = {
  id: string;
  body?: Body;
  retrograde: boolean;
  longitudeAt(date: Date): number;
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

const planetDefinitions: PlanetDefinition[] = [
  {
    id: "Sun",
    retrograde: false,
    longitudeAt: (date) => normalizeDegrees(SunPosition(date).elon)
  },
  {
    id: "Moon",
    body: Body.Moon,
    retrograde: false,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Moon, date))
  },
  {
    id: "Mercury",
    body: Body.Mercury,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Mercury, date))
  },
  {
    id: "Venus",
    body: Body.Venus,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Venus, date))
  },
  {
    id: "Mars",
    body: Body.Mars,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Mars, date))
  },
  {
    id: "Jupiter",
    body: Body.Jupiter,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Jupiter, date))
  },
  {
    id: "Saturn",
    body: Body.Saturn,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Saturn, date))
  },
  {
    id: "Uranus",
    body: Body.Uranus,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Uranus, date))
  },
  {
    id: "Neptune",
    body: Body.Neptune,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Neptune, date))
  },
  {
    id: "Pluto",
    body: Body.Pluto,
    retrograde: true,
    longitudeAt: (date) => normalizeDegrees(EclipticLongitude(Body.Pluto, date))
  },
  {
    id: "NNode",
    retrograde: true,
    longitudeAt: (date) => calculateMeanNorthNode(date)
  }
];

export function calculateNatalChart(
  input: BirthChartInput
): ProviderResult<CalculatedNatalChart> {
  const birth = normalizeBirthInput(input);
  const date = new Date(birth.utcIso);
  const obliquity = e_tilt(MakeTime(date)).tobl;
  const siderealTimeDeg = normalizeDegrees(SiderealTime(date) * 15 + birth.longitude);
  const ascendant = calculateAscendant({
    latitude: birth.latitude,
    siderealTimeDeg,
    obliquity
  });
  const cusps = Array.from({ length: 12 }, (_, index) => roundDegrees(ascendant + index * 30));
  const positions = planetDefinitions.map((planet) => planetPosition(planet, date));
  const planets = positions.reduce<AstroChartData["planets"]>((accumulator, position) => {
    accumulator[position.id] = position.retrograde
      ? [position.longitude, -1]
      : [position.longitude];
    return accumulator;
  }, {});
  const houses = cusps.map<NatalChartHouse>((longitude, index) => ({
    house: index + 1,
    longitude,
    sign: signForLongitude(longitude),
    degreeInSign: degreeInSign(longitude)
  }));
  const notes = [
    "Planet longitudes use astronomy-engine true ecliptic longitude of date.",
    "House cusps use calculated ascendant plus equal-house 30 degree spacing.",
    "Mean lunar north node is approximate; Chiron is not calculated in this phase."
  ];

  if (Math.abs(birth.latitude) > 66.5) {
    notes.push("High-latitude births can produce unstable ascendant/house results.");
  }

  return {
    provider: "astronomy-engine",
    usedMock: false,
    data: {
      chartData: {
        planets,
        cusps
      },
      birth,
      positions,
      houses,
      calculation: {
        engine: "astronomy-engine@2 + local-equal-house",
        houseSystem: birth.houseSystem,
        utcIso: birth.utcIso,
        ascendant: roundDegrees(ascendant),
        obliquity: roundDegrees(obliquity),
        siderealTimeDeg: roundDegrees(siderealTimeDeg),
        notes
      }
    }
  };
}

function normalizeBirthInput(input: BirthChartInput): NormalizedBirthChartInput {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(input.time);

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

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("birth date/time is out of range");
  }

  assertFiniteInRange(input.timezoneOffsetMinutes, -720, 840, "timezoneOffsetMinutes");
  assertFiniteInRange(input.latitude, -89.999, 89.999, "latitude");
  assertFiniteInRange(input.longitude, -180, 180, "longitude");

  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
    input.timezoneOffsetMinutes * 60 * 1000;
  const utcDate = new Date(utcMs);

  if (Number.isNaN(utcDate.getTime())) {
    throw new Error("birth date/time cannot be converted to UTC");
  }

  return {
    ...input,
    houseSystem: "equal",
    timezoneOffsetMinutes: Math.round(input.timezoneOffsetMinutes),
    latitude: roundCoordinate(input.latitude),
    longitude: roundCoordinate(input.longitude),
    utcIso: utcDate.toISOString()
  };
}

function planetPosition(planet: PlanetDefinition, date: Date): NatalChartPosition {
  const longitude = roundDegrees(planet.longitudeAt(date));
  const retrograde =
    planet.retrograde && planet.id !== "NNode" ? isRetrograde(planet, date) : planet.retrograde;

  return {
    id: planet.id,
    longitude,
    sign: signForLongitude(longitude),
    degreeInSign: degreeInSign(longitude),
    retrograde
  };
}

function isRetrograde(planet: PlanetDefinition, date: Date) {
  const previous = planet.longitudeAt(addHours(date, -12));
  const next = planet.longitudeAt(addHours(date, 12));
  return signedAngleDelta(next, previous) < 0;
}

function calculateAscendant({
  latitude,
  siderealTimeDeg,
  obliquity
}: {
  latitude: number;
  siderealTimeDeg: number;
  obliquity: number;
}) {
  const phi = degreesToRadians(latitude);
  const theta = degreesToRadians(siderealTimeDeg);
  const epsilon = degreesToRadians(obliquity);
  const up = {
    x: Math.cos(phi) * Math.cos(theta),
    y: Math.cos(phi) * Math.sin(theta),
    z: Math.sin(phi)
  };
  const east = {
    x: -Math.sin(theta),
    y: Math.cos(theta),
    z: 0
  };
  const a = up.x;
  const b = up.y * Math.cos(epsilon) + up.z * Math.sin(epsilon);
  const first = normalizeDegrees(radiansToDegrees(Math.atan2(-a, b)));
  const candidates = [first, normalizeDegrees(first + 180)];
  const rising = candidates.find((longitude) => eclipticVector(longitude, epsilon, east) > 0);
  const fallback = candidates[0];

  if (fallback === undefined) {
    throw new Error("could not calculate ascendant");
  }

  return rising ?? fallback;
}

function eclipticVector(longitude: number, obliquity: number, axis: { x: number; y: number; z: number }) {
  const lambda = degreesToRadians(longitude);
  const vector = {
    x: Math.cos(lambda),
    y: Math.sin(lambda) * Math.cos(obliquity),
    z: Math.sin(lambda) * Math.sin(obliquity)
  };

  return vector.x * axis.x + vector.y * axis.y + vector.z * axis.z;
}

function calculateMeanNorthNode(date: Date) {
  const julianCenturies = (julianDay(date) - 2451545) / 36525;
  return roundDegrees(
    125.04452 -
      1934.136261 * julianCenturies +
      0.0020708 * julianCenturies ** 2 +
      julianCenturies ** 3 / 450000
  );
}

function julianDay(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
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

function signedAngleDelta(next: number, previous: number) {
  return ((next - previous + 540) % 360) - 180;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function assertFiniteInRange(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
}
