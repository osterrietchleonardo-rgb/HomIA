import { z } from "zod";

/** Esquema de respuesta del agente Homy (IA real, sin mock data). */
export const HomyReplySchema = z.object({
  message: z.string().min(1),
  category: z.string().min(1),
  urgency: z.enum(["baja", "media", "alta"]).catch("media"),
  summary: z.string(),
  suggestions: z.array(z.string().max(120)).max(3).catch([]),
});

export type HomyReply = z.infer<typeof HomyReplySchema>;

export interface HomyChatTurn {
  role: "user" | "homy";
  content: string;
}

export interface HomyApiResponse {
  ok: boolean;
  reply: HomyReply;
}

/** Categorías de servicio reconocidas por el motor de Homy. */
export const HOMY_CATEGORY_LABELS: Record<string, string> = {
  plomeria: "Plomería",
  electricidad: "Electricidad",
  gas: "Gas",
  carpinteria: "Carpintería",
  pintura: "Pintura",
  albanileria: "Albañilería",
  limpieza: "Limpieza",
  mudanza: "Mudanza",
  climatizacion: "Climatización",
  jardineria: "Jardinería",
  electrodomesticos: "Electrodomésticos",
  cerrajeria: "Cerrajería",
  otro: "Otro",
};
