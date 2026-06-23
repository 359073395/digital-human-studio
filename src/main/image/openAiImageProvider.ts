import fs from "node:fs";
import path from "node:path";
import type { ServiceConfiguration } from "../../shared/serviceConfig";
import { defaultServiceSettings } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";
import {
  buildProductPresenterImagePrompt,
  imageSizeForPreset
} from "./presenterImagePromptBuilder";
import {
  ImageProviderUnavailableError,
  type ImageProvider,
  type ProductPresenterImageInput,
  type ProductPresenterImageResult,
  type VisualStoryboardImageInput,
  type VisualStoryboardImageResult
} from "./imageProvider";

interface ImageConfigurationReader {
  getConfiguration: (providerId: "image") => ServiceConfiguration;
}

interface ImageCredentialReader {
  readCredential: (providerId: "image") => Promise<string | null>;
}

interface OpenAiImageProviderOptions {
  fetchImpl?: typeof fetch;
}

interface OpenAiImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

export class OpenAiImageProvider implements ImageProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly configurations: ImageConfigurationReader,
    private readonly credentials: ImageCredentialReader,
    options: OpenAiImageProviderOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateProductPresenterImage(
    input: ProductPresenterImageInput
  ): Promise<ProductPresenterImageResult> {
    const { apiKey, baseUrl, modelName } = await this.readActiveImageSettings();
    const promptPreview = buildProductPresenterImagePrompt({
      avatarDescriptionPrompt: input.task.avatarDescriptionPrompt,
      motionPrompt: input.task.motionPrompt,
      contentLanguage: input.task.contentLanguage,
      preset: input.preset,
      knowledgeContextPrompt: input.knowledgeContextPrompt
    });
    const formData = new FormData();
    formData.append("model", modelName);
    formData.append("prompt", promptPreview);
    formData.append("size", imageSizeForPreset(input.preset));
    formData.append(
      "image[]",
      createImageBlob(input.productImagePath),
      path.basename(input.productImagePath)
    );

    const response = await this.fetchImpl(`${normalizeBaseUrl(baseUrl)}/images/edits`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `OpenAI 图片生成失败 (${response.status}): ${redactSecret(responseText.slice(0, 800)) || response.statusText}`
      );
    }

    return readImageResult(
      this.fetchImpl,
      responseText,
      promptPreview,
      "OpenAI 图片响应缺少图片数据。"
    );
  }

  async generateVisualStoryboardImage(
    input: VisualStoryboardImageInput
  ): Promise<VisualStoryboardImageResult> {
    const { apiKey, baseUrl, modelName } = await this.readActiveImageSettings();
    const promptPreview = input.prompt.trim();
    if (!promptPreview) {
      throw new Error("视觉故事板提示词为空。");
    }

    const response = await this.fetchImpl(`${normalizeBaseUrl(baseUrl)}/images/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        prompt: promptPreview,
        size: "1536x1024",
        response_format: "b64_json"
      })
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `OpenAI 故事板图生成失败 (${response.status}): ${redactSecret(responseText.slice(0, 800)) || response.statusText}`
      );
    }

    return readImageResult(
      this.fetchImpl,
      responseText,
      promptPreview,
      "OpenAI 故事板图响应缺少图片数据。"
    );
  }

  private async readActiveImageSettings(): Promise<{
    apiKey: string;
    baseUrl: string;
    modelName: string;
  }> {
    const configuration = this.configurations.getConfiguration("image");
    if (configuration.settings.enabled === false) {
      throw new ImageProviderUnavailableError("OpenAI 图片服务未启用。");
    }

    const apiKey = await this.credentials.readCredential("image");
    if (!apiKey) {
      throw new ImageProviderUnavailableError("OpenAI 图片 API Key 尚未配置。");
    }

    const baseUrl = configuration.settings.baseUrl || defaultServiceSettings("image").baseUrl;
    if (!baseUrl) {
      throw new ImageProviderUnavailableError("OpenAI 图片 Base URL 尚未配置。");
    }

    return {
      apiKey,
      baseUrl,
      modelName: configuration.settings.modelName || "gpt-image-2"
    };
  }
}

function createImageBlob(imagePath: string): Blob {
  return new Blob([fs.readFileSync(imagePath)], { type: contentTypeFromPath(imagePath) });
}

function contentTypeFromPath(imagePath: string): string {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

async function readImageResult<T extends ProductPresenterImageResult | VisualStoryboardImageResult>(
  fetchImpl: typeof fetch,
  responseText: string,
  promptPreview: string,
  missingImageMessage: string
): Promise<T> {
  const parsed = parseImageResponse(responseText);
  const firstImage = parsed.data?.[0];
  if (firstImage?.b64_json) {
    return {
      imageBytes: Buffer.from(firstImage.b64_json, "base64"),
      extension: "png",
      promptPreview
    } as T;
  }

  if (firstImage?.url) {
    return {
      imageBytes: await downloadImage(fetchImpl, firstImage.url),
      extension: extensionFromUrl(firstImage.url),
      promptPreview
    } as T;
  }

  throw new Error(missingImageMessage);
}

function parseImageResponse(responseText: string): OpenAiImageResponse {
  try {
    return JSON.parse(responseText) as OpenAiImageResponse;
  } catch (error) {
    throw new Error("OpenAI 图片响应不是有效 JSON。", { cause: error });
  }
}

async function downloadImage(fetchImpl: typeof fetch, url: string): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`OpenAI 图片下载失败 (${response.status})。`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function extensionFromUrl(url: string): ProductPresenterImageResult["extension"] {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "jpg";
  }
  if (pathname.endsWith(".webp")) {
    return "webp";
  }
  return "png";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
