import assert from "node:assert/strict"
import test from "node:test"

import { MsmoliIntlPlugin, MsmoliPlugin, testables } from "../index.mjs"
import { createProviderSupport, providerInternals } from "../provider.mjs"

const { CN, INTL } = testables
const { BOOTSTRAP } = providerInternals

const auth = { type: "api", key: "ms-test-token" }
const getAuth = async () => auth

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  })
}

test("both plugin entries expose the provider hooks their profile needs", async () => {
  const cn = await MsmoliPlugin({})
  const intl = await MsmoliIntlPlugin({})

  assert.equal(cn.auth.provider, "msmoli")
  assert.equal(intl.auth.provider, "msmoli-intl")
  assert.equal(typeof cn.auth.loader, "function")
  assert.equal(typeof intl.auth.loader, "function")
  assert.equal(cn.provider.id, "msmoli")
  assert.equal(intl.provider.id, "msmoli-intl")
  assert.equal(typeof cn.provider.models, "function")
  assert.equal(typeof intl.provider.models, "function")
})

test("the bootstrap catalogs match each site's current model count", () => {
  assert.equal(BOOTSTRAP.msmoli.length, 37)
  assert.equal(BOOTSTRAP["msmoli-intl"].length, 35)
  assert.ok(BOOTSTRAP.msmoli.includes("MusePublic/Qwen-Image-Edit"))
  assert.ok(BOOTSTRAP["msmoli-intl"].includes("Qwen/Qwen-Image-Edit"))
})

test("each provider config has its own API address and image models", async () => {
  const cn = await MsmoliPlugin({})
  const intl = await MsmoliIntlPlugin({})
  const cfg = { provider: {} }
  await cn.config(cfg)
  await intl.config(cfg)

  assert.equal(cfg.provider.msmoli.npm, "@ai-sdk/openai-compatible")
  assert.equal(cfg.provider.msmoli.api, "https://api-inference.modelscope.cn/v1")
  assert.equal(cfg.provider["msmoli-intl"].api, "https://api-inference.modelscope.ai/v1")
  assert.deepEqual(cfg.provider.msmoli.models["Qwen/Qwen-Image-Edit"].modalities, {
    input: ["text", "image"],
    output: ["image"]
  })
  assert.deepEqual(cfg.provider["msmoli-intl"].models["Qwen/Qwen-Image-Edit"].modalities.output, ["image"])
})

test("the loader keeps the token and each profile's API base", async () => {
  for (const [profile, base] of [
    [CN, "https://api-inference.modelscope.cn/v1"],
    [INTL, "https://api-inference.modelscope.ai/v1"]
  ]) {
    const support = createProviderSupport(profile, {
      fetchImpl: async () => json({ data: [] })
    })
    const options = await support.loader(getAuth)
    assert.equal(options.baseURL, base)
    assert.equal(options.apiKey, "ms-test-token")
    assert.equal(typeof options.fetch, "function")
  }
})

test("provider.models reads each site's live list", async () => {
  for (const [profile, base, ids] of [
    [CN, "https://api-inference.modelscope.cn/v1", ["deepseek-ai/DeepSeek-V4.1-Flash-1017"]],
    [INTL, "https://api-inference.modelscope.ai/v1", ["Qwen-Ambassador/Qwen3.8-Max"]]
  ]) {
    const seen = []
    const support = createProviderSupport(profile, {
      fetchImpl: async (url, init) => {
        seen.push({ url, headers: new Headers(init.headers) })
        return json({ object: "list", data: ids.map((id) => ({ id })) })
      }
    })
    const models = await support.models({ models: {} }, { auth })
    assert.deepEqual(Object.keys(models), ids)
    assert.equal(seen[0].url, `${base}/models`)
    assert.equal(seen[0].headers.get("authorization"), "Bearer ms-test-token")
  }
})

test("chat is forwarded to the profile's own endpoint", async () => {
  for (const [profile, base] of [
    [CN, "https://api-inference.modelscope.cn/v1"],
    [INTL, "https://api-inference.modelscope.ai/v1"]
  ]) {
    const seen = []
    const support = createProviderSupport(profile, {
      fetchImpl: async (url, init) => {
        seen.push({ url, init })
        return new Response("data: ok\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        })
      }
    })
    const options = await support.loader(getAuth)
    const res = await options.fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ model: "test/model", messages: [] })
    })

    assert.equal(res.status, 200)
    assert.equal(seen[0].url, `${base}/chat/completions`)
    assert.equal(seen[0].init.headers.get("authorization"), "Bearer ms-test-token")
    assert.equal(
      new TextDecoder().decode(seen[0].init.body),
      JSON.stringify({ model: "test/model", messages: [] })
    )
  }
})

test("a chat 401 marks the sign-in expired", async () => {
  const support = createProviderSupport(INTL, {
    fetchImpl: async () => json({ error: { message: "无效的令牌" } }, 401)
  })
  const options = await support.loader(getAuth)
  const res = await options.fetch("https://api-inference.modelscope.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  })
  assert.equal(res.status, 401)
  assert.equal(res.headers.get("x-magpie-sign-in"), "expired")
})

test("image generation polls each site's task API and returns OpenAI data", async () => {
  for (const [profile, base] of [
    [CN, "https://api-inference.modelscope.cn/v1"],
    [INTL, "https://api-inference.modelscope.ai/v1"]
  ]) {
    const calls = []
    const support = createProviderSupport(profile, {
      pollMs: 0,
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        if (url.endsWith("/images/generations")) {
          assert.equal(new Headers(init.headers).get("x-modelscope-async-mode"), "true")
          const body = JSON.parse(init.body)
          assert.equal(body.model, "Qwen/Qwen-Image-Edit")
          return json({ task_id: "task-1" })
        }
        if (url.endsWith("/tasks/task-1")) {
          assert.equal(new Headers(init.headers).get("x-modelscope-task-type"), "image_generation")
          return json({ task_status: "SUCCEED", output_images: [`https://example.invalid/${profile.id}.png`] })
        }
        throw new Error(`unexpected URL ${url}`)
      }
    })
    const options = await support.loader(getAuth)
    const res = await options.fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "Qwen/Qwen-Image-Edit",
        prompt: "一只猫",
        size: "1024x1024"
      })
    })
    const answer = await res.json()
    assert.equal(res.status, 200)
    assert.equal(typeof answer.created, "number")
    assert.deepEqual(answer.data, [{ url: `https://example.invalid/${profile.id}.png` }])
    assert.equal(calls[0].url, `${base}/images/generations`)
  }
})

test("image edits turn magpie's multipart upload into ModelScope image_url", async () => {
  let sent
  const support = createProviderSupport(CN, {
    fetchImpl: async (url, init) => {
      if (url.endsWith("/images/generations")) {
        sent = JSON.parse(init.body)
        return json({ output_images: ["https://example.invalid/edited.png"] })
      }
      throw new Error(`unexpected URL ${url}`)
    }
  })

  const form = new FormData()
  form.append("model", "Qwen/Qwen-Image-Edit")
  form.append("prompt", "把背景改成海边")
  form.append("image", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "a.png")
  const req = new Request("http://local.test/v1/images/edits", { method: "POST", body: form })
  const body = await req.arrayBuffer()
  const options = await support.loader(getAuth)
  const res = await options.fetch("https://api-inference.modelscope.cn/v1/images/edits", {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") },
    body
  })

  assert.equal(res.status, 200)
  assert.equal(sent.model, "Qwen/Qwen-Image-Edit")
  assert.equal(sent.prompt, "把背景改成海边")
  assert.match(sent.image_url[0], /^data:image\/png;base64,/)
  assert.deepEqual((await res.json()).data, [{ url: "https://example.invalid/edited.png" }])
})

test("model classification keeps drawers out of text capabilities", () => {
  const models = providerInternals.modelsOf([
    "Qwen/Qwen-Image-Edit",
    "OpenGVLab/InternVL3_5-241B-A28B",
    "deepseek-ai/DeepSeek-V4.1-Flash-1017"
  ])
  assert.deepEqual(models["Qwen/Qwen-Image-Edit"].capabilities.output, { text: false, image: true })
  assert.deepEqual(models["OpenGVLab/InternVL3_5-241B-A28B"].capabilities.input, {
    text: true,
    image: true
  })
  assert.deepEqual(models["deepseek-ai/DeepSeek-V4.1-Flash-1017"].capabilities.output, {
    text: true,
    image: false
  })
})
