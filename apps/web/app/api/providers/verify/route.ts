import path from "node:path";
import { getDataDir } from "@zeroflow/db";
import { getIndexTtsRuntimeConfig, getProviderHealth, getProviders, hasEnv } from "@zeroflow/providers";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "live" ? "live" : "local";
  const providers = getProviders();
  const indexTtsConfig = getIndexTtsRuntimeConfig();
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
    source: chart.data.source,
    renderer: "AstroChart SVG"
  });

  const birthChartOutputPath = path.join(getDataDir(), "provider-checks", "astrochart-birth.svg");
  const birthChart = await providers.chart.renderNatalChart({
    outputPath: birthChartOutputPath,
    highlight: "ascendant",
    birth: {
      date: "1990-01-01",
      time: "12:00",
      timezoneOffsetMinutes: 480,
      timezone: "Asia/Shanghai",
      latitude: 39.9042,
      longitude: 116.4074,
      placeName: "Beijing",
      houseSystem: "equal",
      zodiacMode: "tropical",
      siderealAyanamsa: "lahiri",
      planetSet: "modern",
      nodeType: "mean"
    }
  });
  checks.push({
    id: "astrochart-birth",
    ok: !birthChart.usedMock && birthChart.data.source === "calculated-birth",
    provider: birthChart.provider,
    assetPath: birthChart.data.assetPath,
    usedSampleData: birthChart.data.usedSampleData,
    source: birthChart.data.source,
    renderer: "AstroChart SVG",
    calculator: birthChart.data.calculation?.engine,
    ascendant: birthChart.data.calculation?.ascendant,
    positions: birthChart.data.positions?.length
  });

  if (mode === "live" && hasEnv("DEEPSEEK_API_KEY")) {
    const script = await providers.llm.generateScript({
      topic: "What is the ascendant sign in astrology?",
      targetDurationSec: 20,
      tone: "clear, warm, and beginner friendly"
    });
    checks.push({
      id: "deepseek",
      ok: !script.usedMock,
      provider: script.provider,
      usedMock: script.usedMock,
      title: script.data.title
    });

    const storyboard = await providers.llm.generateStoryboard({
      scriptText: script.data.scriptText,
      sceneCount: 3,
      targetDurationSec: 20
    });
    checks.push({
      id: "deepseek-storyboard",
      ok: !storyboard.usedMock && storyboard.data.scenes.length > 0,
      provider: storyboard.provider,
      usedMock: storyboard.usedMock,
      scenes: storyboard.data.scenes.length
    });
  }

  if (mode === "live" && hasEnv("YUNWU_API_KEY")) {
    const imageOutputPath = path.join(getDataDir(), "provider-checks", "yunwu.png");
    const image = await providers.image.generateImage({
      prompt: "简洁黑色线稿：上升星座从东方地平线升起，用于占星教学",
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

  if (mode === "live" && indexTtsConfig.runningHubApiKey) {
    const audio = await providers.tts.generateVoiceover({
      text: "This is a short astrology teaching voiceover provider check.",
      outputPath: path.join(getDataDir(), "provider-checks", "runninghub-check.mp3"),
      referenceAudioPath: indexTtsConfig.referenceAudioPath,
      referenceAudioName: indexTtsConfig.referenceAudioName,
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
