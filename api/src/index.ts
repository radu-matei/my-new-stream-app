import { HttpRequest, HttpResponse, InferencingModels, Kv, Llm, Router } from "@fermyon/spin-sdk";

let router = Router();
let decoder = new TextDecoder();

interface Prompt {
  id: string,
  role: string,
  content: string,
}

interface History {
  id: string,
  prompts: Prompt[],
}

// Our Spin application entrypoint.
export async function handleRequest(request: HttpRequest): Promise<HttpResponse> {
  return router.handleRequest(request, { body: request.body });
}

router.get("/api/:id", async (req) => {
  let id = req.params.id;
  let kv = Kv.openDefault();

  if (kv.exists(id)) {
    return { status: 200, body: kv.get(id) };
  } else {
    return { status: 404 }
  }
});

router.delete("/api/:id", async (req) => {
  let id = req.params.id;
  console.log(`Clearing history for ${id}`);
  let kv = Kv.openDefault();

  if (kv.exists(id)) {
    kv.delete(id);
    return { status: 200 };
  } else {
    return { status: 404 }
  }
});

// The generation endpoint that calls into the Llama2 LLM.
router.post("/api/generate", async (_req, extra) => {
  // deserialize the request body
  let p = JSON.parse(decoder.decode(extra.body)) as Prompt;

  let chat: History;
  let kv = Kv.openDefault();
  if (kv.exists(p.id)) {
    chat = JSON.parse(decoder.decode(kv.get(p.id)));
  } else {
    chat = { id: p.id, prompts: [] };
    chat.prompts.push(systemPrompt);
  }
  chat.prompts.push(p);

  // send a request to the language model
  let res = Llm.infer(InferencingModels.Llama2Chat, buildLlama2Prompt(chat.prompts), { maxTokens: 50 });
  console.log(res);

  chat.prompts.push({ id: p.id, content: res.text, role: "Assistant" });
  kv.set(p.id, JSON.stringify(chat));

  // return the response
  return { status: 200, body: sanitizeOutput(res.text) };
});

// Catch-all that returns 404.
router.all("*", async () => {
  return { status: 404, body: "These are not the droids you're looking for..." };
})

let systemPrompt: Prompt = {
  role: "System", id: "", content: `You are an assistant. Be as concise as possible. Avoid using emojis in responses.`
};

// Construct a Llama2 prompt based on the conversation history.
export function buildLlama2Prompt(
  messages: Pick<Prompt, 'content' | 'role'>[]
) {
  const startPrompt = `<s>[INST] `
  const endPrompt = ` [/INST]`
  const conversation = messages.map(({ content, role }, index) => {
    if (role === 'User') {
      return content.trim()
    } else if (role === 'Assistant') {
      return ` [/INST] ${content}</s><s>[INST] `
    } else if (role === 'System' && index === 0) {
      return `<<SYS>>\n${content}\n<</SYS>>\n\n`
    } else {
      throw new Error(`Invalid message role: ${role}`)
    }
  })

  return startPrompt + conversation.join('') + endPrompt
}

function sanitizeOutput(text: string): string {
  const terminations = [
    "</s><s>[",
    "</s><s>",
    "</s><",
    "</s>",
    "</s",
    "</",
  ];

  for (const term of terminations) {
    if (text.endsWith(term)) {
      return text.slice(0, -term.length);
    }
  }

  return text;
}
