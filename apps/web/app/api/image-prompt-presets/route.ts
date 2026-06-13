import {
  listImagePromptPresets,
  upsertImagePromptPresets,
  type ImagePromptPresetKind
} from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";
import { imageStyleOptions } from "@/features/canvas/aiModels";

type ImagePromptPresetDefinition = {
  id: string;
  kind: ImagePromptPresetKind;
  target: string;
  label: string;
};

const presetDefinitions: ImagePromptPresetDefinition[] = [
  ...imageStyleOptions.map((option) => ({
    id: `style:${option.value}`,
    kind: "style" as const,
    target: option.value,
    label: option.label
  }))
];

export async function GET() {
  return NextResponse.json({ presets: mergePresetDefinitions() });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as {
    presets?: Array<{
      id?: unknown;
      enabled?: unknown;
      promptSuffix?: unknown;
    }>;
  };

  const definitionsById = new Map(presetDefinitions.map((preset) => [preset.id, preset]));
  const presets = (body.presets ?? [])
    .map((input) => {
      const id = typeof input.id === "string" ? input.id : "";
      const definition = definitionsById.get(id);

      if (!definition) {
        return null;
      }

      return {
        ...definition,
        enabled: Boolean(input.enabled),
        promptSuffix: typeof input.promptSuffix === "string" ? input.promptSuffix : ""
      };
    })
    .filter((preset): preset is ImagePromptPresetDefinition & {
      enabled: boolean;
      promptSuffix: string;
    } => Boolean(preset));

  upsertImagePromptPresets(presets);

  return NextResponse.json({ presets: mergePresetDefinitions() });
}

function mergePresetDefinitions() {
  const savedById = new Map(listImagePromptPresets().map((preset) => [preset.id, preset]));

  return presetDefinitions.map((definition) => {
    const saved = savedById.get(definition.id);

    return {
      ...definition,
      enabled: saved?.enabled ?? false,
      promptSuffix: saved?.promptSuffix ?? "",
      updatedAt: saved?.updatedAt
    };
  });
}
