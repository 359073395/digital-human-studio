import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import type { FrameTitleStyle, OutputPreset, SubtitleStyle, VideoTask } from "../../shared/domain";

export interface FinishedVideoRenderInput {
  task: VideoTask;
  preset: OutputPreset;
  taskDirectory: string;
  sourceVideoPath: string;
  subtitlePath?: string;
  outputPath: string;
}

export interface FinishedVideoRenderer {
  render(input: FinishedVideoRenderInput): void;
}

export class FfmpegFinishedVideoRenderer implements FinishedVideoRenderer {
  render(input: FinishedVideoRenderInput): void {
    const ffmpegPath = requireFfmpegPath();
    fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });

    const overlayPath = path.join(input.taskDirectory, "post", `overlay-${input.preset.id}.ass`);
    writeOverlayAssFile({
      task: input.task,
      preset: input.preset,
      subtitlePath: input.subtitlePath,
      outputPath: overlayPath
    });

    const videoFilter = [
      `scale=${input.preset.width}:${input.preset.height}:force_original_aspect_ratio=decrease`,
      `pad=${input.preset.width}:${input.preset.height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      `ass=${escapeFilterPath(path.relative(input.taskDirectory, overlayPath))}`
    ].join(",");

    const result = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-i",
        input.sourceVideoPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        videoFilter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        input.outputPath
      ],
      {
        cwd: input.taskDirectory,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 10 * 60 * 1000
      }
    );

    if (result.error) {
      throw new Error(`FFmpeg 合成失败：${result.error.message}`);
    }

    if (result.status !== 0) {
      throw new Error(`FFmpeg 合成失败：${(result.stderr || result.stdout || "").slice(-1200)}`);
    }

    if (!fs.existsSync(input.outputPath) || fs.statSync(input.outputPath).size === 0) {
      throw new Error("FFmpeg 合成完成但没有生成有效 MP4 文件。");
    }
  }
}

export class CopyFinishedVideoRenderer implements FinishedVideoRenderer {
  render(input: FinishedVideoRenderInput): void {
    fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
    fs.copyFileSync(input.sourceVideoPath, input.outputPath);
  }
}

function writeOverlayAssFile(input: {
  task: VideoTask;
  preset: OutputPreset;
  subtitlePath?: string;
  outputPath: string;
}): void {
  const events = [
    ...createFrameTitleEvents(input.task, input.preset),
    ...createSubtitleEvents(input.task.subtitleStyle, input.preset, input.subtitlePath)
  ];

  if (events.length === 0) {
    events.push(
      createAssEvent({
        start: "0:00:00.00",
        end: "9:59:59.99",
        styleName: "Transparent",
        text: ""
      })
    );
  }

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(
    input.outputPath,
    [
      "[Script Info]",
      "ScriptType: v4.00+",
      "WrapStyle: 0",
      "ScaledBorderAndShadow: yes",
      `PlayResX: ${input.preset.width}`,
      `PlayResY: ${input.preset.height}`,
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      createStyleLine("Subtitle", input.task.subtitleStyle),
      createStyleLine("FrameTitle", input.task.frameTitleStyle),
      "Style: Transparent,Arial,1,&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&HFF000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1",
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      ...events
    ].join("\n"),
    "utf8"
  );
}

function createStyleLine(
  styleName: "Subtitle" | "FrameTitle",
  style: SubtitleStyle | FrameTitleStyle
): string {
  const bold = style.fontWeight === "bold" ? -1 : 0;
  return [
    "Style:",
    styleName,
    sanitizeAssField(style.fontFamily || "Arial"),
    style.fontSize,
    assColor(style.textColor, 0),
    assColor(style.textColor, 0),
    assColor(style.backgroundColor, 0),
    assColor(style.backgroundColor, 20),
    bold,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    3,
    0,
    0,
    5,
    24,
    24,
    0,
    1
  ].join(",");
}

function createFrameTitleEvents(task: VideoTask, preset: OutputPreset): string[] {
  const style = task.frameTitleStyle;
  if (!style.enabled) {
    return [];
  }

  const text = selectFrameTitleText(task);
  if (!text) {
    return [];
  }

  return [
    createPositionedAssEvent({
      start: "0:00:00.00",
      end: "9:59:59.99",
      styleName: "FrameTitle",
      text,
      x: Math.round(preset.width / 2),
      y: Math.round(preset.height * (style.verticalPercent / 100))
    })
  ];
}

function createSubtitleEvents(
  style: SubtitleStyle,
  preset: OutputPreset,
  subtitlePath: string | undefined
): string[] {
  if (!style.enabled) {
    return [];
  }

  if (!subtitlePath) {
    throw new Error("字幕样式已启用，但没有找到该输出预设的字幕文件。");
  }

  const entries = parseSrt(fs.readFileSync(subtitlePath, "utf8"));
  if (entries.length === 0) {
    throw new Error("字幕文件没有可用时间轴，不能作为正式成片字幕。");
  }

  const x = Math.round(preset.width / 2);
  const y = Math.round(preset.height * (style.verticalPercent / 100));
  return entries.map((entry) =>
    createPositionedAssEvent({
      start: entry.start,
      end: entry.end,
      styleName: "Subtitle",
      text: entry.text,
      x,
      y
    })
  );
}

function createPositionedAssEvent(input: {
  start: string;
  end: string;
  styleName: "Subtitle" | "FrameTitle";
  text: string;
  x: number;
  y: number;
}): string {
  return createAssEvent({
    start: input.start,
    end: input.end,
    styleName: input.styleName,
    text: `{\\an5\\pos(${input.x},${input.y})}${escapeAssText(input.text)}`
  });
}

function createAssEvent(input: {
  start: string;
  end: string;
  styleName: string;
  text: string;
}): string {
  return `Dialogue: 0,${input.start},${input.end},${input.styleName},,0,0,0,,${input.text}`;
}

function parseSrt(value: string): Array<{ start: string; end: string; text: string }> {
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex === -1) {
        return undefined;
      }

      const [startRaw, endRaw] = lines[timingIndex]?.split("-->").map((part) => part.trim()) ?? [];
      const start = parseSrtTime(startRaw);
      const end = parseSrtTime(endRaw);
      const text = lines
        .slice(timingIndex + 1)
        .join("\\N")
        .trim();
      if (!start || !end || !text) {
        return undefined;
      }

      return { start, end, text };
    })
    .filter((entry): entry is { start: string; end: string; text: string } => Boolean(entry));
}

function parseSrtTime(value: string | undefined): string {
  const match = value?.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) {
    return "";
  }

  const [, hours, minutes, seconds, milliseconds] = match;
  return `${Number(hours)}:${minutes}:${seconds}.${milliseconds.slice(0, 2)}`;
}

function selectFrameTitleText(task: VideoTask): string {
  const explicit = task.frameTitleStyle.text.trim();
  if (explicit) {
    return explicit;
  }

  const coverTitle = task.coverStyle.title.trim();
  if (coverTitle) {
    return coverTitle;
  }

  const firstScriptLine = (task.finalScript || task.sourceScript)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstScriptLine || task.title;
}

function assColor(value: string, alpha: number): string {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value.slice(1) : "ffffff";
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${blue}${green}${red}`.toUpperCase();
}

function escapeAssText(value: string): string {
  return value.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N").replace(/,/g, "，").trim();
}

function sanitizeAssField(value: string): string {
  return value.replace(/,/g, " ").trim() || "Arial";
}

function escapeFilterPath(value: string): string {
  return value.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function requireFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error("未找到内置 FFmpeg，无法合成带字幕和标题的最终 MP4。");
  }

  return ffmpegStaticPath;
}
