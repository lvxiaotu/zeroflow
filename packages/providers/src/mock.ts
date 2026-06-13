import type {
  D3DiagramKind,
  GeneratedScript,
  GeneratedStoryboard,
  ImageProvider,
  LlmProvider,
  TtsProvider
} from "./types";

export function createMockLlmProvider(): LlmProvider {
  return {
    async generateScript(input) {
      const targetDurationSec = input.targetDurationSec ?? 60;
      const topic = normalizeScriptTopic(input.topic || "占星基础知识");
      const mockScripts: Record<string, { hook: string; scriptText: string }> = {
        上升星座: {
          hook: "为什么你觉得自己有时候像两个人？其实答案藏在你出生时东方地平线上升起的那颗星座里。",
          scriptText: [
            `你有没有过这样的感觉：明明自己是个内向的人，但在某些场合却变得特别外向、健谈？`,
            `这可能不是"装出来的"，而是你的「上升星座」在起作用。`,
            ``,
            `上升星座，简单来说，就是你出生那一刻，东方地平线正在升起的那个星座。它像是你戴给世界看的一张面具，是你留给别人的第一印象。`,
            ``,
            `如果说太阳星座代表"我是谁"，月亮星座代表"我感觉什么"，那上升星座就是"别人怎么看我"。它决定了你给人的第一感觉、你的外在风格、甚至你本能的第一反应。`,
            ``,
            `比如你的太阳星座是巨蟹座——敏感、顾家、情绪丰富。但如果你上升在射手座，别人第一眼看到的你，可能是开朗、爱冒险、说话直爽的形象。`,
            ``,
            `这就能解释为什么很多人会说"你看起来不像巨蟹座"。`,
            ``,
            `那怎么查自己的上升星座呢？你需要准确的出生时间、出生地点。因为上升星座每两个小时左右就会换一个，所以出生时间差几分钟，结果可能完全不同。`,
            ``,
            `想知道你的上升星座是什么吗？去看你的出生证明，算出你的上升，你可能会发现一个全新的自己。`
          ].join("\n")
        },
        default: {
          hook: `你了解「${topic}」吗？它可能比你想象中更能揭示你性格中隐藏的那一面。`,
          scriptText: [
            `今天我们来聊一个占星学里非常有趣的概念——「${topic}」。`,
            `很多人第一次听到这个词的时候，觉得它很抽象、很玄乎。但其实，它和你日常生活中的感受和选择息息相关。`,
            ``,
            `简单来说，${topic} 描述的是一个人出生那一刻，天空中某颗星体或某个关键点所处的位置和状态。它不是一个静态的标签，而是一种动态的能量配置，会影响一个人在某些领域的倾向和反应模式。`,
            ``,
            `举个例子你就明白了：如果把人生比作一场舞台剧，太阳星座是你的剧本主线，月亮星座是你的内心独白，而 ${topic} 则是你出场时的灯光设计和背景音乐。它不决定剧情走向，但决定了这场戏的氛围和观众的第一感受。`,
            ``,
            `在实际的占星解读中，${topic} 最常被用来解释为什么两个太阳星座相同的人，性格表现却截然不同。这就是占星学的精妙之处——它不是简单的12种分类，而是由行星、星座、宫位、相位共同构成的复杂图谱。`,
            ``,
            `所以在接下来的几期视频里，我们会从最基础的概念开始，一步步带你读懂自己的星盘。今天先理解 ${topic}，下期我们聊聊它和你其他星座配置之间的互动关系。`
          ].join("\n")
        }
      };
      const match = (mockScripts[topic] || mockScripts.default)!;
      const data: GeneratedScript = {
        title: topic,
        hook: match.hook,
        scriptText: match.scriptText,
        tone: input.tone ?? "温和、清楚、适合占星小白",
        targetDurationSec
      };

      return { provider: "mock-llm", usedMock: true, data };
    },
    async generateStoryboard(input) {
      const count = Math.max(1, Math.min(12, input.sceneCount));
      const duration = Math.max(4, Math.round((input.targetDurationSec ?? 60) / count));
      const paragraphs = input.scriptText
        .split("\n")
        .filter((line) => line.trim().length > 0 && !line.startsWith("比如你的太阳"));
      const paragraphCount = paragraphs.length;
      const firstLine = paragraphs[0] ?? input.scriptText.slice(0, 40);
      const inferredTopic = firstLine.replace(/[「」]/g, "").slice(0, 20);
      const scenes: GeneratedStoryboard["scenes"] = Array.from({ length: count }, (_, index) => ({
        title: index === 0 ? "开场引入" : index === count - 1 ? "总结收尾" : `讲解 ${index + 1}`,
        description:
          index === 0
            ? "用一个悬念/提问开场，抓住观众注意力"
            : index === count - 1
              ? "总结本集核心要点，引导关注下期"
              : "用画面配合口播讲解核心概念",
        narration:
          index === 0
            ? (paragraphs[0]?.slice(0, 100) ?? input.scriptText.slice(0, 80))
            : index === count - 1
              ? (
                  paragraphs[paragraphCount - 1] ??
                  "这就是今天分享的内容，希望对你了解占星有帮助。我们下期见。"
                ).slice(0, 100)
              : (paragraphs[Math.min(index, paragraphCount - 1)] ?? `继续深入讲解这个概念。`).slice(
                  0,
                  100
                ),
        sceneType: index === 1 ? "astro-chart" : index === 2 ? "sketch" : "text",
        durationSec: duration,
        visualPrompt:
          index === 0
            ? "简洁的占星教学标题画面，暖色调，主体清晰，适合短视频开场"
            : index === 1
              ? "占星本命盘圆盘画面，行星位置清晰，带轻微发光和教学标注"
              : index === 2
                ? "简洁线稿插画，表现占星概念，暖米色背景，画面干净"
                : "干净的重点文字画面，柔和暖色背景，优雅排版，适合教学视频",
        caption:
          index === 0
            ? `「${inferredTopic}」到底是什么？`
            : index === count - 1
              ? "总结：记住这三点"
              : `${index + 1}/${count - 1} · 核心讲解`
      }));

      return {
        provider: "mock-llm",
        usedMock: true,
        data: { scenes }
      };
    },
    async generateD3Contract(input) {
      const title = input.title || "D3 Diagram";
      const diagram = input.diagram ?? inferD3Diagram(input.prompt);

      return {
        provider: "mock-llm",
        usedMock: true,
        data: {
          title,
          description: input.description || input.prompt,
          narration: input.narration || input.prompt,
          durationSec: input.durationSec ?? 8,
          diagram,
          visualPreset: diagram,
          data: mockD3Data(diagram, title)
        }
      };
    }
  };
}

function normalizeScriptTopic(value: string) {
  const trimmed = value.trim();
  const cutPhrases = ["我要制作", "我想制作", "请你", "帮我", "要求", "，要求", "。要求", "\n"];
  const cutIndex = cutPhrases
    .map((phrase) => trimmed.indexOf(phrase))
    .filter((index) => index > 0)
    .sort((left, right) => left - right)[0];
  const topic = (cutIndex ? trimmed.slice(0, cutIndex) : trimmed)
    .replace(/[，。,.：:；;、\s]+$/g, "")
    .trim();

  return topic || trimmed.slice(0, 40) || "占星基础知识";
}

function inferD3Diagram(prompt: string): D3DiagramKind {
  const normalized = prompt.toLowerCase();

  if (/关系|关联|连接|link|relationship|network|map/.test(normalized)) {
    return "relationship";
  }

  if (/树|层级|结构|分支|tree|hierarchy/.test(normalized)) {
    return "tree";
  }

  if (/比例|分布|权重|对比|distribution|bar|compare/.test(normalized)) {
    return "distribution";
  }

  return "timeline";
}

function mockD3Data(diagram: D3DiagramKind, title: string) {
  if (diagram === "relationship") {
    return {
      nodes: ["Concept", title, "Evidence", "Practice"],
      links: [
        ["Concept", title],
        [title, "Evidence"],
        [title, "Practice"]
      ]
    };
  }

  if (diagram === "tree") {
    return {
      root: title,
      children: ["Concept", "Evidence", "Practice", "Takeaway"]
    };
  }

  if (diagram === "distribution") {
    return {
      values: [
        { label: "Concept", value: 34 },
        { label: title, value: 42 },
        { label: "Practice", value: 24 }
      ]
    };
  }

  return {
    events: [
      { label: "Concept", value: 0 },
      { label: title, value: 1 },
      { label: "Evidence", value: 2 },
      { label: "Practice", value: 3 }
    ]
  };
}

export function createMockImageProvider(): ImageProvider {
  return {
    async generateImage(input) {
      return {
        provider: "mock-image",
        usedMock: true,
        data: {
          prompt: input.prompt,
          model: input.model,
          size: input.size,
          assetPath: input.outputPath
        }
      };
    }
  };
}

export function createMockTtsProvider(): TtsProvider {
  return {
    async generateVoiceover(input) {
      return {
        provider: "mock-tts",
        usedMock: true,
        data: {
          audioPath: input.outputPath,
          manifestPath: `${input.outputPath}.runninghub/manifest.json`,
          stdout:
            "Mock TTS skipped because RUNNINGHUB_API_KEY or reference audio is not configured.",
          stderr: ""
        }
      };
    }
  };
}
