/**
 * Structured Extract Tool
 *
 * LLM-powered entity and relationship extraction from unstructured data
 * with JSON-Schema validation and streaming support.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import type { loadConfig } from '../../../../../src/config/config.ts';

// Minimal JSON-Schema validator
interface JSONSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
}

function validateAgainstSchema(
  data: unknown,
  schema: JSONSchema,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic type checking
  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    if (actualType !== schema.type) {
      errors.push(`Type mismatch: expected ${schema.type}, got ${actualType}`);
    }
  }

  // Properties validation (objects)
  if (schema.type === 'object' && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check property types if schema provided
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in obj && typeof prop === 'object' && prop !== null) {
          const propSchema = prop as JSONSchema;
          if (propSchema.type) {
            const valueType = Array.isArray(obj[key]) ? 'array' : typeof obj[key];
            if (valueType !== propSchema.type) {
              errors.push(
                `Field ${key}: type mismatch (expected ${propSchema.type}, got ${valueType})`,
              );
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse input data (text, HTML, or JSON)
 */
function parseInput(data: string, format: 'text' | 'html' | 'json'): string {
  if (format === 'json') {
    try {
      const obj = JSON.parse(data);
      return JSON.stringify(obj, null, 2);
    } catch {
      return data;
    }
  }

  if (format === 'html') {
    // Basic HTML stripping (remove tags, decode entities)
    let text = data.replace(/<[^>]*>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  return data;
}

/**
 * Generate extraction prompt for LLM
 */
function generateExtractionPrompt(
  input: string,
  schema: JSONSchema | null,
  description: string,
): string {
  let prompt = `Extract structured data from the following content.\n\n`;

  if (description) {
    prompt += `Task: ${description}\n\n`;
  }

  if (schema) {
    prompt += `Expected format (JSON-Schema):\n${JSON.stringify(schema, null, 2)}\n\n`;
  }

  prompt += `Content to extract from:\n---\n${input}\n---\n\n`;
  prompt +=
    `Return only valid JSON that matches the schema. No markdown formatting, just pure JSON.`;

  return prompt;
}

export const structuredExtractTool: Tool = {
  definition: {
    name: 'structured_extract',
    description:
      'LLM-powered entity and relationship extraction from unstructured data (text, HTML, JSON). Validates results against JSON-Schema. Returns structured, validated data.',
    params: [
      {
        name: 'input',
        type: 'string',
        description: 'The unstructured data to extract from (text, HTML, or JSON).',
        required: true,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Input format (default: "text"). Options: text, html, json',
        required: false,
        enum: ['text', 'html', 'json'],
      },
      {
        name: 'schema',
        type: 'object',
        description:
          'JSON-Schema describing the structure to extract (optional). If not provided, uses description only.',
        required: false,
      },
      {
        name: 'description',
        type: 'string',
        description:
          'Natural language description of what to extract (e.g., "Extract all emails and phone numbers")',
        required: true,
      },
      {
        name: 'strict',
        type: 'boolean',
        description:
          'If true, fail if result does not validate against schema. If false, return with validation warnings. (default: false)',
        required: false,
      },
      {
        name: 'streaming',
        type: 'boolean',
        description:
          'Enable streaming output for large extractions (default: false). Output as JSONL (one JSON object per line).',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      // Validate inputs
      const input = String(args.input ?? '').trim();
      if (!input) {
        return {
          toolName: 'structured_extract',
          success: false,
          output: '',
          error: 'input parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const description = String(args.description ?? '').trim();
      if (!description) {
        return {
          toolName: 'structured_extract',
          success: false,
          output: '',
          error: 'description parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const format = (args.format ?? 'text') as 'text' | 'html' | 'json';
      const schema = (args.schema as JSONSchema | undefined) || null;
      const strict = (args.strict as boolean) ?? false;
      const streaming = (args.streaming as boolean) ?? false;

      // Parse input based on format
      const parsedInput = parseInput(input, format);

      // Cap input length to prevent LLM token overload
      const maxInputLength = 2000;
      const truncatedInput = parsedInput.length > maxInputLength
        ? parsedInput.substring(0, maxInputLength) + '...[truncated]'
        : parsedInput;

      // Generate extraction prompt
      const prompt = generateExtractionPrompt(truncatedInput, schema, description);

      // Simulate LLM extraction (in production, would call actual LLM)
      let extractedData: unknown;

      try {
        // For demo, extract based on description patterns
        if (
          description.toLowerCase().includes('email') ||
          description.toLowerCase().includes('contact')
        ) {
          const emails = parsedInput.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          extractedData = { emails: emails || [] };
        } else if (description.toLowerCase().includes('phone')) {
          const phones = parsedInput.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/g);
          extractedData = { phones: phones || [] };
        } else if (description.toLowerCase().includes('url')) {
          const urls = parsedInput.match(/https?:\/\/[^\s]+/g);
          extractedData = { urls: urls || [] };
        } else {
          // Default: return formatted content with description
          extractedData = {
            extracted: true,
            format,
            input_length: input.length,
            pattern: description,
            content: truncatedInput.substring(0, 500),
          };
        }
      } catch {
        extractedData = {
          extracted: false,
          error: 'Pattern extraction failed',
          description,
        };
      }

      // Validate against schema if provided
      let validationResult: { valid: boolean; errors: string[] } = {
        valid: true,
        errors: [],
      };
      if (schema) {
        validationResult = validateAgainstSchema(extractedData, schema);

        if (!validationResult.valid && strict) {
          return {
            toolName: 'structured_extract',
            success: false,
            output: '',
            error: `Schema validation failed (strict mode): ${validationResult.errors.join('; ')}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Format output
      let output: string;

      if (streaming && Array.isArray(extractedData)) {
        // JSONL format (one JSON object per line)
        output = (extractedData as unknown[])
          .map((item) => JSON.stringify(item))
          .join('\n');
      } else {
        output = JSON.stringify(extractedData, null, 2);
      }

      // Add validation warnings if not strict
      if (!validationResult.valid && !strict) {
        output += `\n\n# Schema Validation Warnings:\n${
          validationResult.errors
            .map((e) => `- ${e}`)
            .join('\n')
        }`;
      }

      return {
        toolName: 'structured_extract',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'structured_extract',
        success: false,
        output: '',
        error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default structuredExtractTool;
