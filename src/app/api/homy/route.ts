import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "@/lib/ai";
import { HomyReplySchema, type HomyReply } from "@/lib/homy";

export const runtime = "nodejs";

const BodySchema = z.object({
  message: z.string().min(1).max(600),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "homy"]),
        content: z.string().max(1200),
      })
    )
    .max(8)
    .optional(),
});

const SYSTEM_PROMPT = `Sos Homy, el asistente de inteligencia artificial de HomIA, un marketplace de servicios para el hogar en Argentina cuyo eslogan es "Tu hogar en buenas manos".

Tu trabajo: interpretar en lenguaje natural lo que el usuario necesita en su casa (una reparación, una mejora, una urgencia, una duda sobre cómo funciona HomIA) y devolver ÚNICAMENTE un JSON válido, sin texto antes ni después, con esta forma exacta:

{"message":"...","category":"...","urgency":"...","summary":"...","suggestions":["...","...","..."]}

Reglas:
- "message": 1 o 2 frases en español rioplatense, cálido, empático, resolutivo y transparente. Traducí la necesidad técnica a palabras simples, tranquilizá y decile el próximo paso concreto. Nunca inventes precios, plazos exactos ni prometas profesionales específicos: HomIA todavía no te mostró resultados, vos solo interpretás el pedido.
- "category": una de estas opciones, la más cercana al pedido: plomeria, electricidad, gas, carpinteria, pintura, albanileria, limpieza, mudanza, climatizacion, jardineria, electrodomesticos, cerrajeria, otro.
- "urgency": "alta" si hay un problema urgente (fuga de agua, corte eléctrico, gas), "media" si es algo de esta semana, "baja" si es una mejora o plan futuro.
- "summary": el pedido resumido en menos de 12 palabras.
- "suggestions": exactamente 3 frases cortas (máximo 8 palabras cada una) que el usuario podría querer pedirte a continuación.
- Si el mensaje no tiene que ver con el hogar, redirigí con amabilidad dentro de "message", usá category "otro" y urgency "baja".
- Si preguntan qué es HomIA, explicalo en "message" con simpleza: conecta clientes con profesionales verificados, presupuestos integrales de mano de obra y materiales, pagos protegidos y devolución de sobrantes.`;

function fallbackReply(): HomyReply {
  return {
    message:
      "Estoy teniendo una falla momentánea para procesar tu pedido, pero tranqui: no perdiste nada. Probá de nuevo en unos segundos y lo resolvemos juntos.",
    category: "otro",
    urgency: "media",
    summary: "",
    suggestions: [
      "Necesito un presupuesto para una reparación",
      "Tengo una urgencia en mi casa",
      "¿Cómo funciona HomIA?",
    ],
  };
}

function extractJson(raw: string): unknown {
  let cleaned = raw.trim();
  const fenceStart = cleaned.indexOf("```");
  if (fenceStart !== -1) {
    cleaned = cleaned.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reply: fallbackReply() },
      { status: 200 }
    );
  }

  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, reply: fallbackReply() },
      { status: 200 }
    );
  }

  const { message, history } = parsedBody.data;

  try {
    const zai = await ZAI.create();

    const chatMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: SYSTEM_PROMPT }];

    for (const turn of history ?? []) {
      chatMessages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.content,
      });
    }
    chatMessages.push({ role: "user", content: message });

    const completion = await zai.chat.completions.create({
      messages: chatMessages,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const json = extractJson(raw);
    const reply = HomyReplySchema.safeParse(json);

    if (!reply.success) {
      return NextResponse.json({ ok: false, reply: fallbackReply() });
    }

    return NextResponse.json({ ok: true, reply: reply.data });
  } catch (error) {
    console.error("[api/homy] Error contactando al motor de IA:", error);
    return NextResponse.json({ ok: false, reply: fallbackReply() });
  }
}
