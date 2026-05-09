/**
 * DataJud Proxy — Firebase Cloud Function (2nd Gen)
 *
 * Proxies browser requests to the DataJud CNJ API, adding the required
 * Authorization header that cannot be sent directly from the browser
 * due to CORS restrictions on the DataJud API.
 *
 * Endpoint: POST /api/datajud
 * Body: { tribunal: string, body: object }
 * Returns: DataJud Elasticsearch response (JSON)
 */
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

// ── Constants ───────────────────────────────────────────────────────────

const DATAJUD_API_KEY = defineSecret("DATAJUD_API_KEY");
const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const REQUEST_TIMEOUT_MS = 35_000;

/**
 * Whitelist of valid tribunal aliases (prevents SSRF).
 * Matches the complete set from datajud-service.ts.
 */
const VALID_ALIASES = new Set([
  // Superiores
  "stf", "stj", "tst", "tse", "stm",
  // Federal
  "trf1", "trf2", "trf3", "trf4", "trf5", "trf6",
  // Estadual
  "tjac", "tjal", "tjam", "tjap", "tjba", "tjce", "tjdft", "tjes", "tjgo",
  "tjma", "tjmg", "tjms", "tjmt", "tjpa", "tjpb", "tjpe", "tjpi", "tjpr",
  "tjrj", "tjrn", "tjro", "tjrr", "tjrs", "tjsc", "tjse", "tjsp", "tjto",
  // Trabalho (TRT 1-24)
  ...Array.from({length: 24}, (_, i) => `trt${i + 1}`),
  // Eleitoral
  ...["ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg",
    "ms", "mt", "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr",
    "rs", "sc", "se", "sp", "to"].map((uf) => `tre-${uf}`),
  // Militar
  "tjmmg", "tjmrs", "tjmsp",
]);

// ── CORS helpers ──────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

type DatajudProxyRequest = {
  method?: string;
  body?: {
    tribunal?: unknown;
    body?: unknown;
  } | null;
};

type DatajudProxyResponse = {
  set: (key: string, value: string) => DatajudProxyResponse;
  status: (code: number) => DatajudProxyResponse;
  json: (payload: unknown) => void;
  send: (payload: unknown) => void;
};

type DatajudProxyDependencies = {
  fetchImpl: typeof fetch;
  getApiKey: () => string | undefined;
  logError: (...args: unknown[]) => void;
  createAbortController: () => AbortController;
  setTimeoutImpl: typeof setTimeout;
  clearTimeoutImpl: typeof clearTimeout;
};

const defaultDatajudProxyDependencies: DatajudProxyDependencies = {
  fetchImpl: fetch,
  getApiKey: () => DATAJUD_API_KEY.value()?.trim(),
  logError: (...args: unknown[]) => logger.error(...args),
  createAbortController: () => new AbortController(),
  setTimeoutImpl: setTimeout,
  clearTimeoutImpl: clearTimeout,
};

export async function handleDatajudProxyRequest(
  req: DatajudProxyRequest,
  res: DatajudProxyResponse,
  overrides: Partial<DatajudProxyDependencies> = {}
): Promise<void> {
  const dependencies = {
    ...defaultDatajudProxyDependencies,
    ...overrides,
  };

  // Set CORS headers on all responses
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.set(key, value);
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed. Use POST."});
    return;
  }

  // Parse and validate request
  const {tribunal, body} = req.body ?? {};

  if (!tribunal || typeof tribunal !== "string") {
    res.status(400).json({error: "Missing or invalid 'tribunal' field."});
    return;
  }

  const alias = tribunal.toLowerCase().trim();
  if (!VALID_ALIASES.has(alias)) {
    res.status(400).json({
      error: `Invalid tribunal alias: '${alias}'.`,
    });
    return;
  }

  if (!body || typeof body !== "object") {
    res.status(400).json({error: "Missing or invalid 'body' field."});
    return;
  }

  const targetUrl = `${DATAJUD_BASE_URL}/api_publica_${alias}/_search`;

  try {
    const dataJudApiKey = dependencies.getApiKey()?.trim();
    if (!dataJudApiKey) {
      dependencies.logError("DATAJUD_API_KEY secret is not configured for datajudProxy.");
      res.status(500).json({error: "DataJud proxy secret is not configured."});
      return;
    }

    const controller = dependencies.createAbortController();
    const timeout = dependencies.setTimeoutImpl(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await dependencies.fetchImpl(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `APIKey ${dataJudApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await response.text();

      // Forward status and body from DataJud
      res
        .status(response.status)
        .set("Content-Type", response.headers.get("content-type") || "application/json")
        .send(data);
    } finally {
      dependencies.clearTimeoutImpl(timeout);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      res.status(504).json({error: "DataJud request timed out."});
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    dependencies.logError("DataJud proxy error:", message);
    res.status(502).json({error: `DataJud proxy error: ${message}`});
  }
}

// ── Cloud Function (2nd Gen) ──────────────────────────────────────────────

export const datajudProxy = onRequest(
  {
    region: "southamerica-east1",
    // Use the App Engine default SA — the default Compute Engine SA was deleted.
    serviceAccount: "hocapp-44760@appspot.gserviceaccount.com",
    secrets: [DATAJUD_API_KEY],
  },
  async (req, res) => handleDatajudProxyRequest(req, res)
);
