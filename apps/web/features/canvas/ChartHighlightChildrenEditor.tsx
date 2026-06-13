import type { CanvasNode } from "@zeroflow/core";
import {
  chartHighlightKindOptions,
  chartHighlightStyleOptions,
  findChartHighlightTargetOption,
  getChartHighlightSummary,
  getChartHighlightTargetOptionValue,
  getChartHighlightTargetOptions,
  type ChartHighlightDataPatch
} from "./chartHighlightNodes";

type ChartHighlightChildrenEditorProps = {
  chartNode: CanvasNode;
  highlights: CanvasNode[];
  onAdd: (chartNode: CanvasNode) => void;
  onDelete: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
};

type ChartHighlightNodeEditorProps = {
  chartNode: CanvasNode;
  highlight: CanvasNode;
  onChange: (nodeId: string, patch: ChartHighlightDataPatch) => void;
};

export function ChartHighlightChildrenEditor({
  chartNode,
  highlights,
  onAdd,
  onDelete,
  onSelect
}: ChartHighlightChildrenEditorProps) {
  return (
    <section className="chart-highlight-children">
      <header>
        <div>
          <strong>星盘高亮子节点</strong>
          <span>{highlights.length > 0 ? `${highlights.length} 个` : "未添加"}</span>
        </div>
        <button type="button" onClick={() => onAdd(chartNode)}>
          添加高亮
        </button>
      </header>

      {highlights.length === 0 ? (
        <p>高亮会作为星盘的子节点保存。添加后，选中对应子节点来设置目标、时间和样式。</p>
      ) : (
        <ol>
          {highlights.map((highlight) => {
            const summary = getChartHighlightSummary(highlight);

            return (
              <li key={highlight.id}>
                <div className="chart-highlight-row-head">
                  <strong>{summary.label}</strong>
                  <span>
                    {summary.startSec.toFixed(1)}s / {summary.durationSec.toFixed(1)}s
                  </span>
                </div>
                <div className="chart-highlight-row-actions">
                  {onSelect ? (
                    <button type="button" onClick={() => onSelect(highlight.id)}>
                      编辑子节点
                    </button>
                  ) : null}
                  <button data-danger="true" type="button" onClick={() => onDelete(highlight.id)}>
                    删除
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function ChartHighlightNodeEditor({
  chartNode,
  highlight,
  onChange
}: ChartHighlightNodeEditorProps) {
  const summary = getChartHighlightSummary(highlight);
  const secondaryTarget = getString(highlight.data.secondaryTargetId, "");
  const targetOptions = getChartHighlightTargetOptions(chartNode, summary.kind);
  const selectedTargetOption = findChartHighlightTargetOption(
    targetOptions,
    summary.target,
    secondaryTarget
  );
  const selectedTargetValue = selectedTargetOption
    ? getChartHighlightTargetOptionValue(selectedTargetOption)
    : getManualTargetValue(summary.target, secondaryTarget);

  const applyTargetOption = (option: (typeof targetOptions)[number]) => {
    onChange(highlight.id, {
      targetId: option.targetId,
      secondaryTargetId: option.secondaryTargetId ?? "",
      label: option.label
    });
  };

  const handleKindChange = (kind: string) => {
    const nextOptions = getChartHighlightTargetOptions(chartNode, kind);
    const nextOption = nextOptions[0];

    onChange(highlight.id, {
      highlightKind: kind,
      ...(nextOption
        ? {
            targetId: nextOption.targetId,
            secondaryTargetId: nextOption.secondaryTargetId ?? "",
            label: nextOption.label
          }
        : {})
    });
  };

  const handleTargetChange = (value: string) => {
    const option = targetOptions.find(
      (item) => getChartHighlightTargetOptionValue(item) === value
    );

    if (option) {
      applyTargetOption(option);
      return;
    }

    const [targetId, secondaryTargetId] = value.split("=>");
    onChange(highlight.id, {
      targetId: targetId ?? "",
      secondaryTargetId: secondaryTargetId ?? ""
    });
  };

  return (
    <section className="chart-highlight-children">
      <header>
        <div>
          <strong>高亮设置</strong>
          <span>{summary.label}</span>
        </div>
      </header>

      <div className="chart-highlight-grid">
        <label>
          类型
          <select value={summary.kind} onChange={(event) => handleKindChange(event.currentTarget.value)}>
            {chartHighlightKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          目标
          <select value={selectedTargetValue} onChange={(event) => handleTargetChange(event.currentTarget.value)}>
            {!selectedTargetOption && selectedTargetValue ? (
              <option value={selectedTargetValue}>
                {formatManualTargetLabel(summary.target, secondaryTarget)}
              </option>
            ) : null}
            {targetOptions.map((option) => {
              const optionValue = getChartHighlightTargetOptionValue(option);

              return (
                <option key={`${option.kind}-${optionValue}`} value={optionValue}>
                  {option.detail ? `${option.label} (${option.detail})` : option.label}
                </option>
              );
            })}
          </select>
        </label>

        <label>
          名称
          <input
            value={summary.label}
            onChange={(event) => onChange(highlight.id, { label: event.currentTarget.value })}
          />
        </label>

        <label>
          开始秒
          <input
            min={0}
            step={0.1}
            type="number"
            value={summary.startSec}
            onChange={(event) =>
              onChange(highlight.id, {
                startSec: clampNumber(Number(event.currentTarget.value), 0, 3600)
              })
            }
          />
        </label>

        <label>
          持续秒
          <input
            min={0.1}
            step={0.1}
            type="number"
            value={summary.durationSec}
            onChange={(event) =>
              onChange(highlight.id, {
                durationSec: clampNumber(Number(event.currentTarget.value), 0.1, 60)
              })
            }
          />
        </label>

        <label>
          样式
          <select
            value={summary.style}
            onChange={(event) => onChange(highlight.id, { style: event.currentTarget.value })}
          >
            {chartHighlightStyleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          颜色
          <input
            type="color"
            value={summary.color}
            onChange={(event) => onChange(highlight.id, { color: event.currentTarget.value })}
          />
        </label>

        <label>
          强度
          <input
            max={2}
            min={0}
            step={0.1}
            type="number"
            value={summary.emphasis}
            onChange={(event) =>
              onChange(highlight.id, {
                emphasis: clampNumber(Number(event.currentTarget.value), 0, 2)
              })
            }
          />
        </label>
      </div>
    </section>
  );
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getManualTargetValue(targetId: string, secondaryTargetId: string) {
  return secondaryTargetId ? `${targetId}=>${secondaryTargetId}` : targetId;
}

function formatManualTargetLabel(targetId: string, secondaryTargetId: string) {
  return secondaryTargetId ? `${targetId} / ${secondaryTargetId}` : targetId;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
