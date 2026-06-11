import path from "node:path";
import { getDataDir } from "@zeroflow/db";
import { getProviderHealth, getProviders, hasEnv, readEnv } from "@zeroflow/providers";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "live" ? "live" : "local";
  const providers = getProviders();
  const checks: Array<Record<string, unknown>> = [];

  const chartOutputPath = path.join(getDataDir(), "provider-checks", "astrochart.svg");
  const chart = await providers.chart.renderNatalChart({
    outputPath: chartOutputPath,
    highlight: "ascendant"
  });
  checks.push({
    id: "astrochart",
    ok: !chart.usedMock,
    provider: chart.provider,
    assetPath: chart.data.assetPath,
    usedSampleData: chart.data.usedSampleData,
    source: chart.data.source
  });

  const birthChartOutputPath = path.join(getDataDir(), "provider-checks", "astrochart-birth.svg");
  const birthChart = await providers.chart.renderNatalChart({
    outputPath: birthChartOutputPath,
    highlight: "ascendant",
    birth: {
      date: "1990-01-01",
      time: "12:00",
      timezoneOffsetMinutes: 480,
      latitude: 39.9042,
      longitude: 116.4074,
      placeName: "Beijing",
      houseSystem: "equal"
    }
  });
  checks.push({
    id: "astrochart-birth",
    ok: !birthChart.usedMock && birthChart.data.source === "calculated-birth",
    provider: birthChart.provider,
    assetPath: birthChart.data.assetPath,
    usedSampleData: birthChart.data.usedSampleData,
    source: birthChart.data.source,
    ascendant: birthChart.data.calculation?.ascendant,
    positions: birthChart.data.positions?.length
  });

  if (mode === "live" && hasEnv("DEEPSEEK_API_KEY")) {
    const script = await providers.llm.generateScript({
      topic: "上升星座是什么？",
      targetDurationSec: 20,
      tone: "清楚、温和、适合占星小白"
    });
    checks.push({
      id: "deepseek",
      ok: !script.usedMock,
      provider: script.provider,
      usedMock: script.usedMock,
      title: script.data.title
    });
  }

  if (mode === "live" && hasEnv("YUNWU_API_KEY")) {
    const imageOutputPath = path.join(getDataDir(), "provider-checks", "yunwu.png");
    const image = await providers.image.generateImage({
      prompt: "simple black line drawing, ascendant sign rising over horizon, educational astrology",
      outputPath: imageOutputPath,
      size: "1024x1024"
    });
    checks.push({
      id: "yunwu",
      ok: !image.usedMock,
      provider: image.provider,
      usedMock: image.usedMock,
      assetPath: image.data.assetPath,
      hasUrl: Boolean(image.data.url)
    });
  }

  if (mode === "live" && hasEnv("RUNNINGHUB_API_KEY")) {
    const referenceAudioPath = readEnv("INDEXTTS_REFERENCE_AUDIO_PATH");
    const referenceAudioName = readEnv("INDEXTTS_REFERENCE_AUDIO_NAME");
    const audio = await providers.tts.generateVoiceover({
      text: "这是一段占星教学配音链路检查。",
      outputPath: path.join(getDataDir(), "provider-checks", "runninghub-check.mp3"),
      referenceAudioPath,
      referenceAudioName,
      dryRun: body.ttsDryRun !== false
    });
    checks.push({
      id: "runninghub",
      ok: !audio.usedMock,
      provider: audio.provider,
      usedMock: audio.usedMock,
      audioPath: audio.data.audioPath,
      manifestPath: audio.data.manifestPath
    });
  }

  return NextResponse.json({
    mode,
    health: getProviderHealth(),
    checks
  });
}
