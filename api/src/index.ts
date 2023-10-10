import { HttpRequest, HttpResponse, InferencingModels, Kv, Llm, Router } from "@fermyon/spin-sdk";

let router = Router();
let decoder = new TextDecoder();

export async function handleRequest(request: HttpRequest): Promise<HttpResponse> {
  return router.handleRequest(request, { body: request.body });
}

interface Prompt {
  id: string,
  role: string,
  content: string,
}

interface History {
  id: string,
  prompts: Prompt[],
}

router.get("/api/:id", async (req) => {
  let id = req.params.id;
  console.log(`Getting history for conversation ID ${id}`);
  // Getting the conversation history from the KV store for a given ID.
  try {
    let kv = Kv.openDefault();
    if (kv.exists(id)) {
      return { status: 200, body: kv.get(id) };
    } else {
      return { status: 404, body: "Not Found" };
    }
  } catch {
    return error();
  }
});

router.post("/api/generate", async (_req, extra) => {
  try {
    let p = JSON.parse(decoder.decode(extra.body)) as Prompt;
    console.log(p);

    // Open the default KV store and check if a conversation ID is present there.
    // If present, get it and deserialize it. Otherwise, create a new conversation.

    let chat: History;
    let kv = Kv.openDefault();
    if (kv.exists(p.id)) {
      chat = JSON.parse(decoder.decode(kv.get(p.id)));
    } else {
      chat = { id: p.id, prompts: [] };
      chat.prompts.push(systemPrompt);
    }
    chat.prompts.push(p);

    let res = Llm.infer(InferencingModels.Llama2Chat, buildLlama2Prompt(chat.prompts), { maxTokens: 50 });
    console.log(res);

    // Append the new message to the history and save it to KV before sending it back.
    chat.prompts.push({ id: p.id, role: "Assistant", content: res.text });
    kv.set(p.id, JSON.stringify(chat));

    return { status: 200, body: res.text };
  }
  catch (e) {
    return error();
  }
});

router.all("*", async () => {
  return { status: 404 }
});


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

let systemPrompt: Prompt = {
  role: "System", id: "", content: `You are an assistant. Be as concise as possible. Avoid using emojis in responses.`
};

// Function to generate a generic error message.
function error(): HttpResponse {
  return { status: 500, body: "You might want to ask ChatGPT to fix this..." }
}

