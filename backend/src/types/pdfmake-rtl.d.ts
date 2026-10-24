declare module '@digicole/pdfmake-rtl' {
  type PdfDefinition = Record<string, unknown>;

  interface PdfOutput {
    getBuffer(): Promise<Buffer | Uint8Array>;
  }

  interface PdfMake {
    addFonts(fonts: Record<string, Record<string, string>>): void;
    createPdf(definition: PdfDefinition): PdfOutput;
  }

  const pdfmake: PdfMake;
  export default pdfmake;
}

declare module '@digicole/pdfmake-rtl/fonts/Cairo' {
  const fonts: { Cairo: Record<string, string> };
  export default fonts;
}
