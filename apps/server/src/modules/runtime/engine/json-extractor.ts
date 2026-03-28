import type {
  JsonExtractionConfidence,
  JsonExtractionMethod,
  JsonExtractionResult
} from '@contrix/runtime-core';

function tryParseJson(value: string): { success: boolean; error: string | null } {
  try {
    JSON.parse(value);
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid JSON.'
    };
  }
}

function buildResult(
  extractedText: string | null,
  method: JsonExtractionMethod,
  confidence: JsonExtractionConfidence
): JsonExtractionResult {
  if (!extractedText) {
    return {
      extractedText: null,
      method: 'failed',
      confidence: 'low',
      parseSucceeded: false,
      parseError: 'No JSON candidate found.'
    };
  }

  const parse = tryParseJson(extractedText);

  return {
    extractedText,
    method,
    confidence,
    parseSucceeded: parse.success,
    parseError: parse.error
  };
}

function stripMarkdownFence(rawText: string): string | null {
  const trimmed = rawText.trim();

  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const lines = trimmed.split('\n');
    if (lines.length >= 3) {
      const withoutFence = lines.slice(1, -1).join('\n').trim();
      if (withoutFence) {
        return withoutFence;
      }
    }
  }

  const regex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  const match = regex.exec(rawText);
  if (!match || !match[1]) {
    return null;
  }

  const extracted = match[1].trim();
  return extracted || null;
}

function findJsonSubstring(rawText: string): string | null {
  const text = rawText;

  for (let start = 0; start < text.length; start += 1) {
    const char = text[start];
    if (char !== '{' && char !== '[') {
      continue;
    }

    const stack: string[] = [char === '{' ? '}' : ']'];
    let inString = false;
    let isEscaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const current = text[index];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (current === '\\') {
          isEscaped = true;
          continue;
        }

        if (current === '"') {
          inString = false;
        }

        continue;
      }

      if (current === '"') {
        inString = true;
        continue;
      }

      if (current === '{') {
        stack.push('}');
        continue;
      }

      if (current === '[') {
        stack.push(']');
        continue;
      }

      const expected = stack[stack.length - 1];
      if ((current === '}' || current === ']') && expected === current) {
        stack.pop();
        if (stack.length === 0) {
          const candidate = text.slice(start, index + 1).trim();
          const parse = tryParseJson(candidate);
          if (parse.success) {
            return candidate;
          }
          break;
        }
      }
    }
  }

  return null;
}

export function extractJsonCandidate(rawText: string): JsonExtractionResult {
  const direct = rawText.trim();
  if (direct) {
    const directResult = buildResult(direct, 'direct', 'high');
    if (directResult.parseSucceeded) {
      return directResult;
    }
  }

  const strippedFence = stripMarkdownFence(rawText);
  if (strippedFence) {
    const markdownResult = buildResult(strippedFence, 'markdown_strip', 'medium');
    if (markdownResult.parseSucceeded) {
      return markdownResult;
    }
  }

  const substring = findJsonSubstring(rawText);
  if (substring) {
    const substringResult = buildResult(substring, 'json_substring', 'low');
    if (substringResult.parseSucceeded) {
      return substringResult;
    }
  }

  return {
    extractedText: null,
    method: 'failed',
    confidence: 'low',
    parseSucceeded: false,
    parseError: 'Unable to extract valid JSON from model output.'
  };
}

