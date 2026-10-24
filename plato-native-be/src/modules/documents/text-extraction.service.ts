import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

const MIN_TEXT_LENGTH = 20;

@Injectable()
export class TextExtractionService {
  async extract(buffer: Buffer, mimetype: string): Promise<string> {
    const text =
      mimetype === 'application/pdf'
        ? await this.extractPdf(buffer)
        : (await mammoth.extractRawText({ buffer })).value;

    const trimmed = text.trim();
    if (trimmed.length < MIN_TEXT_LENGTH) {
      throw new Error('Extracted text is empty or too short to be useful');
    }
    return trimmed;
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => page.text).join('\n');
    } finally {
      await parser.destroy();
    }
  }
}
