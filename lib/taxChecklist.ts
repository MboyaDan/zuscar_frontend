// The seven go-live items, in the order of docs/tax-configuration.md in the backend repository.
// If that document changes, change this list in the same pull request. Nothing here is tax advice.
export const TAX_CHECKLIST: { id: string; text: string }[] = [
  { id: "vat-registration", text: "Confirm whether the business is VAT-registered, with its registration details. If it is not, the system must not be configured to add VAT." },
  { id: "category-treatment", text: "Confirm the correct treatment for each product category (food, soft drinks, alcohol, accommodation, services) and set each product and room type to it explicitly." },
  { id: "rates", text: "Confirm the standard rate and any other rates, and update the tax categories." },
  { id: "inclusive-rounding", text: "Confirm whether prices are tax-inclusive or tax-exclusive, and the rounding rule on receipts." },
  { id: "other-levies", text: "Confirm any other applicable taxes or levies and whether they must appear on receipts." },
  { id: "etims", text: "Confirm the eTIMS or other invoicing obligation and the integration route." },
  { id: "record", text: "Record who verified it and when. The system records your name and the time when you press Mark as verified." },
];
