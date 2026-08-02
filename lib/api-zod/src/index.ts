export * from "./generated/api";
export * from "./generated/types";

// Alguns nomes existem tanto como schema Zod (valor, em ./generated/api)
// quanto como interface TS pura (tipo, em ./generated/types) — o restante do
// código sempre usa o valor (.safeParse), então reexportamos explicitamente
// pra resolver a ambiguidade do `export *` duplo (TS2308).
export {
  CreateFonteBody,
  UpdateFonteBody,
  CreatePostBody,
  UpdatePostBody,
  GenerateFromUrlBody,
  UploadMediaBody,
  UpdateInstagramPartnerBody,
  ScanInstagramPartnersResponse,
  CreateInstagramPartnerBody,
  CreatePartnerContentItemBody,
  UpdatePartnerContentItemBody,
  UpdateScheduleSettingsBody,
} from "./generated/api";
