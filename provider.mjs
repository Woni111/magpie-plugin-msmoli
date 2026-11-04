// Model/provider support for the two ModelScope deployments. The check-in and
// usage hooks remain in index.mjs; this module adds the part that makes the
// same provider a chat and image provider.

const NPM = "@ai-sdk/openai-compatible"
const REQUEST_TIMEOUT_MS = 15_000
const IMAGE_POLL_MS = 2_000
const IMAGE_TIMEOUT_MS = 5 * 60_000
const IMAGE_BUSY_MS = [3_000, 8_000, 15_000]

const DRAWER_RE =
  /(?:qwen-image|image-edit|image-generation|gpt-image|dall-e|flux|imagen|imagine|seedream|cogview|stable-diffusion|sdxl|wanx|wan2|kolors|hidream|sensenova-u1|hy-image)/i
const VISION_RE =
  /(?:internvl|qwen(?:[\d.]*)?-vl|(?:^|[/_.-])(?:vl|vlm|vision|omni|llava)(?:[/_.-]|$)|minicpm-v|glm-[\d.]+v)/i
const REASONING_RE =
  /(?:deepseek|qwen3|glm-5|minimax-m3|intern-s1|nex-n2\.5|step-[35]|omni|longcat|jan-nano)/i

const BOOTSTRAP = {
  msmoli: [
    "deepseek-ai/DeepSeek-V4-Flash-0731",
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Pro-0813",
    "deepseek-ai/DeepSeek-V4.1-Flash",
    "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    "early-access/EA-29B-A4B",
    "MedAIBase/AntAngelMed",
    "meituan-longcat/LongCat-Flash-Lite",
    "MiniMax/MiniMax-M1-80k",
    "MiniMax/MiniMax-M3",
    "mistralai/Mistral-Large-Instruct-2407",
    "MusePublic/Qwen-Image-Edit",
    "nex-agi/Nex-N2.5-mini",
    "nex-agi/Nex-N2.5-Pro",
    "opencompass/CompassJudger-1-32B-Instruct",
    "OpenGVLab/InternVL3_5-241B-A28B",
    "PaddlePaddle/ERNIE-4.5-0.3B-PT",
    "PaddlePaddle/ERNIE-4.5-21B-A3B-PT",
    "PaddlePaddle/ERNIE-4.5-300B-A47B-PT",
    "PaddlePaddle/ERNIE-4.5-VL-28B-A3B-PT",
    "Qwen/Qwen-Image-Edit",
    "Qwen/Qwen3.5-122B-A10B",
    "Qwen/Qwen3.5-27B",
    "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.5-397B-A17B",
    "Qwen/Qwen3.8-27B",
    "Qwen/Qwen3.8-Flash-Next",
    "Shanghai_AI_Laboratory/Intern-S1",
    "Shanghai_AI_Laboratory/Intern-S1-mini",
    "Shanghai_AI_Laboratory/Intern-S2-Preview",
    "stepfun-ai/Step-3.5-Flash",
    "stepfun-ai/Step-3.7-Flash",
    "stepfun-ai/Step-5-Preview",
    "XGenerationLab/XiYanSQL-QwenCoder-32B-2412",
    "XGenerationLab/XiYanSQL-QwenCoder-32B-2504",
    "ZhipuAI/GLM-4.7-Flash",
    "ZhipuAI/GLM-5.2"
  ],
  "msmoli-intl": [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Pro-0813",
    "deepseek-ai/DeepSeek-V4.1-Flash",
    "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    "early-access/EA-29B-A4B",
    "iic/Tongyi-DeepResearch-30B-A3B",
    "Menlo/Jan-nano",
    "MiniMax/MiniMax-M3",
    "MusePublic/Qwen-Image-Edit",
    "nex-agi/Nex-N2.5-mini",
    "nex-agi/Nex-N2.5-Pro",
    "opencompass/CompassJudger-1-32B-Instruct",
    "OpenGVLab/InternVL3_5-241B-A28B",
    "PaddlePaddle/ERNIE-4.5-0.3B-PT",
    "PaddlePaddle/ERNIE-4.5-21B-A3B-PT",
    "PaddlePaddle/ERNIE-4.5-300B-A47B-PT",
    "PaddlePaddle/ERNIE-4.5-VL-28B-A3B-PT",
    "Qwen-Ambassador/Qwen3.7-Max",
    "Qwen-Ambassador/Qwen3.7-Plus",
    "Qwen-Ambassador/Qwen3.8-27B",
    "Qwen-Ambassador/Qwen3.8-Flash-Next",
    "Qwen-Ambassador/Qwen3.8-Max",
    "Qwen-Ambassador/Qwen3.8-Omni-Flash",
    "Qwen/Qwen-Image-Edit",
    "Qwen/Qwen3.5-122B-A10B",
    "Qwen/Qwen3.5-27B",
    "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.5-397B-A17B",
    "Qwen/Qwen3.8-27B",
    "Shanghai_AI_Laboratory/Intern-S1",
    "Shanghai_AI_Laboratory/Intern-S1-mini",
    "stepfun-ai/Step-3.5-Flash",
    "stepfun-ai/Step-5-Preview",
    "zai-org/GLM-4.7-Flash",
    "zai-org/GLM-5.2"
  ]
}

const KNOWN_LIMITS = {
  "deepseek-ai/DeepSeek-V4.1-Flash": { context: 1_048_576, output: 384_000 },
  "deepseek-ai/DeepSeek-V4.1-Flash-1017": { context: 1_048_576, output: 384_000 },
  "MiniMax/MiniMax-M3": { context: 1_048_576, output: 512_000 },
  "Qwen/Qwen3.8-27B": { context: 262_144, output: 262_143 }
}

const defaultFetch = (...args) => globalThis.fetch(...args)

const apiKeyOf = (auth) =>
  auth?.type === "api" && typeof auth.key === "string" ? auth.key.trim() : ""

const isDrawer = (id) => DRAWER_RE.test(String(id))
const isVision = (id) => VISION_RE.test(String(id))

function prettyName(id) {
  const tail = String(id)
    .split("/")
    .pop()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return tail || String(id)
}

function modelNames(ids) {
  const counts = new Map()
  for (const id of ids) {
    const name = prettyName(id)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return new Map(ids.map((id) => [id, counts.get(prettyName(id)) > 1 ? id : prettyName(id)]))
}

function modelRow(id, name = prettyName(id)) {
  const drawer = isDrawer(id)
  const vision = !drawer && isVision(id)
  const takesImage = drawer || vision
  const inputs = takesImage ? ["text", "image"] : ["text"]
  const outputs = drawer ? ["image"] : ["text"]
  const inputCapabilities = { text: true, image: takesImage }
  const outputCapabilities = drawer ? { text: false, image: true } : { text: true, image: false }
  const limit = KNOWN_LIMITS[id]
  return {
    id,
    name,
    ...(limit ? { limit } : {}),
    reasoning: !drawer && REASONING_RE.test(String(id)),
    attachment: takesImage,
    modalities: { input: inputs, output: outputs },
    capabilities: {
      reasoning: !drawer && REASONING_RE.test(String(id)),
      attachment: takesImage,
      input: inputCapabilities,
      output: outputCapabilities
    }
  }
}

function modelsOf(ids) {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))]
  const names = modelNames(unique)
  return Object.fromEntries(unique.map((id) => [id, modelRow(id, names.get(id))]))
}

function configRow(row) {
  return row
}

function errorResponse(status, message, extraHeaders) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(extraHeaders ?? {})
    }
  })
}

function mergeHeaders(input, init) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return headers
}

async function requestBody(input, init) {
  if (init?.body !== undefined) {
    if (typeof init.body === "string") return new TextEncoder().encode(init.body)
    if (init.body instanceof ArrayBuffer) return new Uint8Array(init.body)
    if (ArrayBuffer.isView(init.body)) {
      return new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength)
    }
    if (init.body instanceof Blob) return new Uint8Array(await init.body.arrayBuffer())
    return init.body
  }
  if (input instanceof Request) return new Uint8Array(await input.clone().arrayBuffer())
  return undefined
}

async function requestText(input, init) {
  const body = await requestBody(input, init)
  if (body === undefined) return ""
  if (typeof body === "string") return body
  return new TextDecoder().decode(body)
}

async function requestJSON(input, init) {
  const text = await requestText(input, init)
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error("request body is not JSON"), { status: 400 })
  }
}

async function blobDataURL(blob) {
  const bytes = Buffer.from(await blob.arrayBuffer())
  const type = blob.type || "application/octet-stream"
  return `data:${type};base64,${bytes.toString("base64")}`
}

async function imageRequest(input, init) {
  const headers = mergeHeaders(input, init)
  const contentType = headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return requestJSON(input, init)

  const req =
    input instanceof Request
      ? new Request(input.url, {
          method: init?.method ?? input.method,
          headers,
          body: await requestBody(input, init)
        })
      : new Request(input, init)
  const form = await req.formData()
  const body = {}
  for (const [key, value] of form) {
    if (typeof value === "string") body[key] = value
  }
  const images = []
  for (const name of ["image", "image[]"]) {
    for (const value of form.getAll(name)) {
      if (value instanceof Blob) images.push(await blobDataURL(value))
    }
  }
  if (images.length) body.image_url = images
  return body
}

function abortError() {
  return Object.assign(new Error("request aborted"), { name: "AbortError" })
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const done = () => {
      signal?.removeEventListener("abort", stop)
      resolve()
    }
    const stop = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener("abort", stop, { once: true })
  })
}

function upstreamMessage(payload) {
  return String(
    payload?.errors?.message ??
      payload?.error?.message ??
      payload?.error ??
      payload?.message ??
      ""
  ).trim()
}

async function bodySays(res, words) {
  try {
    return (await res.clone().text()).toLowerCase().includes(words)
  } catch {
    return false
  }
}

function taskPictures(payload) {
  const out = []
  for (const url of payload?.output_images ?? []) {
    if (typeof url === "string" && url) out.push(url)
  }
  for (const image of payload?.images ?? []) {
    if (typeof image?.url === "string" && image.url) out.push(image.url)
  }
  for (const image of payload?.data ?? []) {
    if (typeof image?.url === "string" && image.url) out.push(image.url)
  }
  return out
}

export function createProviderSupport(
  profile,
  {
    fetchImpl = defaultFetch,
    pollMs = IMAGE_POLL_MS,
    timeoutMs = IMAGE_TIMEOUT_MS,
    busyMs = IMAGE_BUSY_MS
  } = {}
) {
  const ids = BOOTSTRAP[profile.id] ?? []
  const bootstrap = modelsOf(ids)
  const modelPath = `${profile.api}/models`

  async function fetchModels(key) {
    const res = await fetchImpl(modelPath, {
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json"
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (res.status === 401) {
      throw Object.assign(new Error(`${profile.name}拒绝了此访问令牌，请重新登录`), {
        signIn: "expired"
      })
    }
    if (!res.ok) throw new Error(`${profile.name}模型列表返回 HTTP ${res.status}`)

    let payload
    try {
      payload = await res.json()
    } catch {
      throw new Error(`${profile.name}返回的模型列表不是 JSON`)
    }
    const data = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : null
    if (!data) throw new Error(`${profile.name}返回的模型列表格式不正确`)
    return modelsOf(data.map((model) => model?.id))
  }

  async function startTask(key, fields, signal) {
    const request = { model: fields.model, prompt: fields.prompt }
    if (fields.size && fields.size !== "auto") request.size = fields.size
    if (Array.isArray(fields.image_url) && fields.image_url.length) {
      request.image_url = fields.image_url
    }
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(`${profile.api}/images/generations`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          accept: "application/json",
          "content-type": "application/json",
          "X-ModelScope-Async-Mode": "true"
        },
        body: JSON.stringify(request),
        redirect: "error",
        signal
      })
      if (res.ok) return res
      const busy =
        res.status === 429 ||
        (await bodySays(res, "queue is full")) ||
        (await bodySays(res, "user queue is full"))
      if (!busy || attempt >= busyMs.length) return res
      await sleep(busyMs[attempt], signal)
    }
  }

  async function oneImage(key, fields, signal) {
    const started = await startTask(key, fields, signal)
    if (!started.ok) {
      const text = await started.text().catch(() => "")
      throw Object.assign(
        new Error(`${profile.name}图像接口返回 ${started.status}: ${text.slice(0, 2000) || "无错误说明"}`),
        { status: started.status }
      )
    }

    let payload
    try {
      payload = await started.json()
    } catch {
      throw Object.assign(new Error(`${profile.name}图像接口返回的不是 JSON`), { status: 502 })
    }
    const direct = taskPictures(payload)
    if (direct.length || !payload?.task_id) {
      if (!direct.length) {
        throw Object.assign(
          new Error(
            `${profile.name}没有创建图像任务${upstreamMessage(payload) ? `: ${upstreamMessage(payload)}` : ""}`
          ),
          { status: 502 }
        )
      }
      return direct
    }

    const deadline = Date.now() + timeoutMs
    while (true) {
      if (Date.now() >= deadline) {
        throw Object.assign(new Error(`${profile.name}图像任务超时`), { status: 504 })
      }
      await sleep(pollMs, signal)
      const polled = await fetchImpl(`${profile.api}/tasks/${encodeURIComponent(payload.task_id)}`, {
        headers: {
          authorization: `Bearer ${key}`,
          accept: "application/json",
          "X-ModelScope-Task-Type": "image_generation"
        },
        redirect: "error",
        signal
      })
      if (!polled.ok) {
        const text = await polled.text().catch(() => "")
        throw Object.assign(
          new Error(
            `${profile.name}查询图像任务返回 ${polled.status}: ${text.slice(0, 2000) || "无错误说明"}`
          ),
          { status: polled.status }
        )
      }

      let task
      try {
        task = await polled.json()
      } catch {
        throw Object.assign(new Error(`${profile.name}图像任务返回的不是 JSON`), { status: 502 })
      }
      const status = String(task?.task_status ?? "").toUpperCase()
      if (["SUCCEED", "SUCCEEDED", "SUCCESS"].includes(status)) {
        const pictures = taskPictures(task)
        if (!pictures.length) {
          throw Object.assign(
            new Error(
              `${profile.name}完成了图像任务但没有返回图片${upstreamMessage(task) ? `: ${upstreamMessage(task)}` : ""}`
            ),
            { status: 502 }
          )
        }
        return pictures
      }
      if (["FAILED", "FAILURE", "CANCELED", "CANCELLED"].includes(status)) {
        throw Object.assign(
          new Error(
            `${profile.name}图像任务失败${upstreamMessage(task) ? `: ${upstreamMessage(task)}` : ""}`
          ),
          { status: 502 }
        )
      }
    }
  }

  async function draw(key, fields, signal) {
    const count = Math.max(1, Math.min(10, Number.parseInt(fields.n ?? "1", 10) || 1))
    const urls = []
    let lastError
    for (let i = 0; i < count; i++) {
      try {
        urls.push(...(await oneImage(key, fields, signal)))
      } catch (error) {
        lastError = error
        if (urls.length) break
        throw error
      }
    }
    if (!urls.length) throw lastError ?? new Error(`${profile.name}没有生成图片`)
    return new Response(
      JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: urls.map((url) => ({ url }))
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  }

  async function forward(input, init, key) {
    const source = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    )
    const target = `${profile.api}${source.pathname.replace(/^\/v1/, "")}${source.search}`
    const headers = mergeHeaders(input, init)
    headers.set("authorization", `Bearer ${key}`)
    headers.set("user-agent", `magpie/${profile.id}`)
    if (!headers.has("accept")) headers.set("accept", "application/json")

    const method = init?.method ?? (input instanceof Request ? input.method : "POST")
    const body =
      method === "GET" || method === "HEAD" ? undefined : await requestBody(input, init)
    const res = await fetchImpl(target, {
      method,
      headers,
      body,
      redirect: "error",
      signal: init?.signal ?? (input instanceof Request ? input.signal : undefined)
    })
    if (res.status !== 401) return res

    const text = await res.text()
    const out = new Headers(res.headers)
    out.delete("content-encoding")
    out.delete("content-length")
    out.set("X-Magpie-Sign-In", "expired")
    return new Response(text, { status: res.status, statusText: res.statusText, headers: out })
  }

  return {
    bootstrap,
    configModels: () =>
      Object.fromEntries(Object.entries(bootstrap).map(([id, row]) => [id, configRow(row)])),
    async models(provider, { auth } = {}) {
      const key = apiKeyOf(auth)
      if (!key) return provider.models
      try {
        return await fetchModels(key)
      } catch (error) {
        if (error?.signIn) throw error
        return provider.models
      }
    },
    async loader(getAuth) {
      const auth = await getAuth()
      const key = apiKeyOf(auth)
      if (!key) return {}
      return {
        baseURL: profile.api,
        apiKey: key,
        async fetch(input, init = {}) {
          const current = apiKeyOf(await getAuth()) || key
          const url = new URL(
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url
          )
          const path = url.pathname
          try {
            if (path.endsWith("/images/generations") || path.endsWith("/images/edits")) {
              return await draw(current, await imageRequest(input, init), init.signal)
            }
            if (
              path.endsWith("/chat/completions") ||
              path.endsWith("/responses") ||
              path.endsWith("/models")
            ) {
              return await forward(input, init, current)
            }
            return errorResponse(404, `${profile.name}插件不提供 ${path.replace(/^\/v1/, "") || path}`)
          } catch (error) {
            if (error?.name === "AbortError") throw error
            return errorResponse(
              Number.isInteger(error?.status) ? error.status : 502,
              error?.message ?? String(error),
              Number.isInteger(error?.status) && error.status === 401
                ? { "X-Magpie-Sign-In": "expired" }
                : undefined
            )
          }
        }
      }
    }
  }
}

export const providerInternals = {
  NPM,
  BOOTSTRAP,
  KNOWN_LIMITS,
  configRow,
  isDrawer,
  isVision,
  modelNames,
  modelRow,
  modelsOf,
  prettyName
}
