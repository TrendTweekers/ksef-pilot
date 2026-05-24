import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseXml, parseXsdAsync, validate } from "xml-xsd-engine";

export const OFFICIAL_FA3_XSD_URL =
  "https://raw.githubusercontent.com/CIRFMF/ksef-docs/main/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd";
const LOCAL_FA3_XSD_FILE = "schemat_FA3_v1-0E.xsd";
const schemaDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas/fa3");
const schemaLocationFiles = new Map<string, string>([
  [LOCAL_FA3_XSD_FILE, LOCAL_FA3_XSD_FILE],
  ["schemat.xsd", LOCAL_FA3_XSD_FILE],
  [
    "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/StrukturyDanych_v10-0E.xsd",
    "StrukturyDanych_v10-0E.xsd"
  ],
  [
    "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/ElementarneTypyDanych_v10-0E.xsd",
    "ElementarneTypyDanych_v10-0E.xsd"
  ],
  [
    "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/KodyKrajow_v10-0E.xsd",
    "KodyKrajow_v10-0E.xsd"
  ]
]);

let schemaPromise: Promise<unknown> | null = null;

interface SchemaIssue {
  path: string;
  code: string;
  message: string;
  line?: number;
  col?: number;
  severity: string;
}

function schemaFileForLocation(location: string) {
  const fileName = schemaLocationFiles.get(location) ?? schemaLocationFiles.get(path.basename(location)) ?? path.basename(location);

  if (!/^[A-Za-z0-9_.()-]+\.xsd$/.test(fileName)) {
    throw new Error(`Unsupported FA(3) XSD dependency: ${location}`);
  }

  return path.join(schemaDirectory, fileName);
}

async function loadVendoredSchema(location: string) {
  const filePath = schemaFileForLocation(location);
  return readFile(filePath, "utf8").catch((error) => {
    throw new Error(`Could not load vendored FA(3) XSD ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function loadSchema() {
  schemaPromise ??= loadVendoredSchema(LOCAL_FA3_XSD_FILE).then((xsd) =>
    parseXsdAsync(xsd, async (location) => loadVendoredSchema(location))
  );

  return schemaPromise;
}

export function describeSchemaValidation() {
  return {
    schema: "FA(3)",
    officialXsdUrl: OFFICIAL_FA3_XSD_URL,
    localXsdFile: LOCAL_FA3_XSD_FILE,
    enforced: true,
    reason:
      "The app validates generated XML against a vendored copy of the official CIRFMF FA(3) schema before KSeF submission is enabled."
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
      enforced: true,
      officialXsdUrl: OFFICIAL_FA3_XSD_URL,
      localXsdFile: LOCAL_FA3_XSD_FILE,
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
