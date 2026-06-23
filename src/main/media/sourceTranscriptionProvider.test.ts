// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { createAppPaths, getTaskDirectory, type AppPaths } from "../storage/appPaths";
import { openTaskDatabase, runMigrations, type TaskDatabase } from "../storage/database";
import { TaskRepository } from "../storage/taskRepository";
import { OpenAiCompatibleSourceTranscriptionProvider } from "./sourceTranscriptionProvider";

const TEST_API_KEY = "sk-source-asr";

let tempDir: string;
let appPaths: AppPaths;
let database: TaskDatabase;
let repository: TaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dhs-source-transcription-"));
  appPaths = createAppPaths(tempDir);
  database = openTaskDatabase(appPaths.databasePath);
  runMigrations(database);
  repository = new TaskRepository(database, appPaths);
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createConfiguration(
  patch: Partial<ServiceConfiguration["settings"]> = {}
): ServiceConfiguration {
  return {
    providerId: "asr",
    label: "ASR",
    kind: "speech-to-text",
    settings: {
      baseUrl: "https://api.hyjiexi.eu.org/v1",
      modelName: "gemini-3.1-flash-lite",
      asrMode: "chat-audio",
      enabled: true,
      ...patch
    },
    credentialConfigured: true,
    updatedAt: "2026-06-24T00:00:00.000Z"
  };
}

function createLlmConfiguration(): ServiceConfiguration {
  return {
    providerId: "llm",
    label: "LLM",
    kind: "language-model",
    settings: {
      baseUrl: "https://api.hyjiexi.eu.org/v1",
      modelName: "gpt-5.5",
      enabled: true
    },
    credentialConfigured: true,
    updatedAt: "2026-06-24T00:00:00.000Z"
  };
}

function createProvider(
  fetchImpl: typeof fetch,
  configuration: ServiceConfiguration = createConfiguration()
): OpenAiCompatibleSourceTranscriptionProvider {
  return new OpenAiCompatibleSourceTranscriptionProvider(
    {
      getConfiguration: (providerId) =>
        providerId === "asr" ? configuration : createLlmConfiguration()
    },
    {
      readCredential: async () => TEST_API_KEY
    },
    fetchImpl
  );
}

function importSourceWav(taskId: string): string {
  const sourcePath = path.join(tempDir, "source.wav");
  fs.writeFileSync(sourcePath, createTinyWavBuffer());
  const taskDirectory = getTaskDirectory(appPaths, taskId);
  const relativePath = "source/uploaded-source.wav";
  fs.mkdirSync(path.join(taskDirectory, "source"), { recursive: true });
  fs.copyFileSync(sourcePath, path.join(taskDirectory, ...relativePath.split("/")));
  repository.addMediaAsset(taskId, "source-audio", relativePath);
  return relativePath;
}

function createTinyWavBuffer(): Buffer {
  const sampleRate = 8000;
  const durationSeconds = 0.1;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

describe("OpenAiCompatibleSourceTranscriptionProvider", () => {
  it("transcribes source wav through chat audio and writes transcript plus SRT", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                transcript: "Halo creator",
                segments: [{ start_seconds: 0, end_seconds: 1.2, text: "Halo creator" }],
                notes: "chat audio ok"
              })
            }
          }
        ]
      })
    );
    const task = repository.createTask({ title: "Source ASR" });
    importSourceWav(task.id);

    const result = await createProvider(fetchMock).transcribe(
      repository.getTask(task.id)!,
      appPaths
    );
    const taskDirectory = getTaskDirectory(appPaths, task.id);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://api.hyjiexi.eu.org/v1/chat/completions");
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TEST_API_KEY}` });
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "gemini-3.1-flash-lite" });
    expect(result.transcript).toBe("Halo creator");
    expect(
      fs.readFileSync(path.join(taskDirectory, "source", "source-transcript.txt"), "utf8")
    ).toBe("Halo creator");
    expect(
      fs.readFileSync(path.join(taskDirectory, "subtitles", "source-transcript.srt"), "utf8")
    ).toContain("00:00:00,000 --> 00:00:01,200");
  });

  it("does not treat audio/transcriptions 404 as a successful source transcript", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("not found", { status: 404, statusText: "Not Found" })
    );
    const task = repository.createTask({ title: "Source ASR 404" });
    importSourceWav(task.id);

    await expect(
      createProvider(
        fetchMock,
        createConfiguration({
          asrMode: "audio-transcriptions",
          modelName: "missing-transcribe-model"
        })
      ).transcribe(repository.getTask(task.id)!, appPaths)
    ).rejects.toThrow("404");

    const taskDirectory = getTaskDirectory(appPaths, task.id);
    expect(fs.existsSync(path.join(taskDirectory, "source", "source-transcript.txt"))).toBe(false);
  });
});
