import { PDFParse } from 'npm:pdf-parse';

export async function extractPdfText(data: Uint8Array): Promise<string | null> {
  try {
    const parser = new PDFParse(data);
    const text = await parser.getText();
    return text.text?.trim() || null;
  } catch (e) {
    console.error(`[pdf] Extraction error: ${(e as Error).message}`);
    return null;
  }
}
