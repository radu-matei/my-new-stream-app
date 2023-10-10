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
    }

    let res = Llm.infer(InferencingModels.Llama2Chat, p.content, { maxTokens: 50 });
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

// Function to generate a generic error message.
function error(): HttpResponse {
  return { status: 500, body: "You might want to ask ChatGPT to fix this..." }
}

