import { parseXml, parseXsdAsync, validate } from "xml-xsd-engine";

export const OFFICIAL_FA3_XSD_URL =
  "https://raw.githubusercontent.com/CIRFMF/ksef-docs/main/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd";

let schemaPromise: Promise<unknown> | null = null;

async function loadText(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load XSD ${url}: ${response.status}`);
  }

  return response.text();
}

async function loadSchema() {
  schemaPromise ??= loadText(OFFICIAL_FA3_XSD_URL).then((xsd) =>
    parseXsdAsync(xsd, async (location) => {
      try {
        const url = location.startsWith("http") ? location : new URL(location, OFFICIAL_FA3_XSD_URL).toString();
        return await loadText(url);
      } catch {
        return null;
      }
    })
  );

  return schemaPromise;
}

export function describeSchemaValidation() {
  return {
    schema: "FA(3)",
    officialXsdUrl: OFFICIAL_FA3_XSD_URL,
    enforced: true,
    reason:
      "The app validates generated XML against the official CIRFMF FA(3) schema before KSeF submission is enabled."
  };
}

export async function validateFa3XmlAgainstOfficialXsd(xml: string) {
  try {
    const schema = await loadSchema();
    const result = validate(parseXml(xml), schema as never, { recover: true, collectAll: true });
    const issues = (result.issues ?? []).map((issue: {
      path?: string;
      code?: string;
      message?: string;
      line?: number;
      col?: number;
      severity?: string;
    }) => ({
      path: issue.path ?? "",
      code: issue.code ?? "XSD_VALIDATION",
      message: issue.message ?? "Schema validation issue",
      line: issue.line,
      col: issue.col,
      severity: issue.severity ?? "error"
    }));

    return {
      valid: Boolean(result.valid),
      enforced: true,
      officialXsdUrl: OFFICIAL_FA3_XSD_URL,
      issueCount: issues.length,
      issues
    };
  } catch (error) {
    return {
      valid: false,
      enforced: false,
      officialXsdUrl: OFFICIAL_FA3_XSD_URL,
      issueCount: 1,
      issues: [
        {
          path: "",
          code: "XSD_VALIDATOR_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Official XSD validator is unavailable.",
          severity: "error"
        }
      ]
    };
  }
}
