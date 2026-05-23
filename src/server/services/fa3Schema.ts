export const OFFICIAL_FA3_XSD_URL =
  "https://raw.githubusercontent.com/CIRFMF/ksef-docs/main/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd";

export function describeSchemaValidation() {
  return {
    schema: "FA(3)",
    officialXsdUrl: OFFICIAL_FA3_XSD_URL,
    enforced: false,
    reason:
      "The app currently performs business-rule validation before generating XML. Full XSD validation is intentionally not marked as enforced until the deployed validator is pinned and tested against the official CIRFMF schema."
  };
}
