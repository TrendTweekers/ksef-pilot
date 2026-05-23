import { parseXml, parseXsdAsync, validate } from "xml-xsd-engine";

export const OFFICIAL_FA3_XSD_URL =
  "https://raw.githubusercontent.com/CIRFMF/ksef-docs/main/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd";

let schemaPromise: Promise<unknown> | null = null;

interface SchemaIssue {
  path: string;
  code: string;
  message: string;
  line?: number;
  col?: number;
  severity: string;
}

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

function issueTextValue(message: string) {
  return message.match(/text "([^"]+)"/)?.[1] ?? "";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function isIsoDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isKnownDateFacetCompatibilityIssue(issue: SchemaIssue) {
  if (issue.code !== "VALID_WRONG_TYPE") {
    return false;
  }

  const value = issueTextValue(issue.message);
  const path = issue.path.replace(/\[\d+\]/g, "");

  return (
    (path.endsWith("/fa:Naglowek/fa:DataWytworzeniaFa") && isIsoDateTime(value)) ||
    (path.endsWith("/fa:Fa/fa:P_1") && isIsoDate(value))
  );
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
    const suppressedIssues = issues.filter(isKnownDateFacetCompatibilityIssue);
    const blockingIssues = issues.filter((issue) => !isKnownDateFacetCompatibilityIssue(issue));

    return {
      valid: blockingIssues.length === 0,
      enforced: true,
      officialXsdUrl: OFFICIAL_FA3_XSD_URL,
      issueCount: blockingIssues.length,
      issues: blockingIssues,
      suppressedIssueCount: suppressedIssues.length,
      suppressedIssues,
      compatibilityNotes: suppressedIssues.length
        ? [
            "The local JS validator reports official FA(3) imported date/dateTime simple types as numeric facet errors. These warnings are ignored only when the XML value is a valid ISO date/dateTime at the exact FA(3) paths."
          ]
        : []
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
