export class TranscriptProcessor {
  private maxCharsPerLine: number;
  private maxLines: number;
  private lines: string[];
  private partialText: string;
  private lastUserTranscript: string;
  private finalTranscriptHistory: string[]; // Array to store history of final transcripts
  private maxFinalTranscripts: number; // Max number of final transcripts to keep

  constructor(maxCharsPerLine: number, maxLines: number, maxFinalTranscripts: number = 3) {
    this.maxCharsPerLine = maxCharsPerLine;
    this.maxLines = maxLines;
    this.lastUserTranscript = "";
    this.lines = [];
    this.partialText = "";
    this.finalTranscriptHistory = []; // Initialize empty history
    this.maxFinalTranscripts = maxFinalTranscripts; // Default to 3 if not specified
  }

  public processString(newText: string | null, isFinal: boolean): string {
    newText = (newText === null ? "" : newText.trim());

    if (!isFinal) {
      // Store this as the current partial text (overwriting old partial)
      this.partialText = newText;
      this.lastUserTranscript = newText;
      return this.buildPreview(this.partialText);
    } else {
      // We have a final text -> clear out the partial text to avoid duplication
      this.partialText = "";

      // Add to transcript history when it's a final transcript
      this.addToTranscriptHistory(newText);

      // Return a formatted version of the full transcript history
      return this.getFormattedTranscriptHistory();
    }
  }

  // New method to get formatted transcript history
  public getFormattedTranscriptHistory(): string {
    if (this.finalTranscriptHistory.length === 0) {
      return "";
    }

    // Combine all transcripts in history
    const combinedText = this.finalTranscriptHistory.join(" ");

    // Wrap this combined text
    const wrapped = this.wrapText(combinedText, this.maxCharsPerLine);

    // Take only the last maxLines lines if there are more
    const displayLines = wrapped.length > this.maxLines
      ? wrapped.slice(wrapped.length - this.maxLines)
      : wrapped;

    // Add padding to ensure exactly maxLines are displayed
    const linesToPad = this.maxLines - displayLines.length;
    for (let i = 0; i < linesToPad; i++) {
      displayLines.push(""); // Add empty lines at the end
    }

    return displayLines.join("\n");
  }

  // Method to format partial transcript with history
  public getFormattedPartialTranscript(combinedText: string): string {
    // Wrap the combined text
    const wrapped = this.wrapText(combinedText, this.maxCharsPerLine);

    // Take only the last maxLines lines if there are more
    const displayLines = wrapped.length > this.maxLines
      ? wrapped.slice(wrapped.length - this.maxLines)
      : wrapped;

    // Add padding to ensure exactly maxLines are displayed
    const linesToPad = this.maxLines - displayLines.length;
    for (let i = 0; i < linesToPad; i++) {
      displayLines.push(""); // Add empty lines at the end
    }

    return displayLines.join("\n");
  }

  // Add to transcript history
  private addToTranscriptHistory(transcript: string): void {
    if (transcript.trim() === "") return; // Don't add empty transcripts

    this.finalTranscriptHistory.push(transcript);

    // Ensure we don't exceed maxFinalTranscripts
    while (this.finalTranscriptHistory.length > this.maxFinalTranscripts) {
      this.finalTranscriptHistory.shift(); // Remove oldest transcript
    }
  }

  // Get the transcript history
  public getFinalTranscriptHistory(): string[] {
    return [...this.finalTranscriptHistory]; // Return a copy to prevent external modification
  }

  // Get combined transcript history as a single string
  public getCombinedTranscriptHistory(): string {
    return this.finalTranscriptHistory.join(" ");
  }

  // Method to set max final transcripts
  public setMaxFinalTranscripts(maxFinalTranscripts: number): void {
    this.maxFinalTranscripts = maxFinalTranscripts;
    // Trim history if needed after changing the limit
    while (this.finalTranscriptHistory.length > this.maxFinalTranscripts) {
      this.finalTranscriptHistory.shift();
    }
  }

  // Get max final transcripts
  public getMaxFinalTranscripts(): number {
    return this.maxFinalTranscripts;
  }

  private buildPreview(partial: string): string {
    // Wrap the partial text
    const partialChunks = this.wrapText(partial, this.maxCharsPerLine);

    // Combine with finalized lines
    const combined = [...this.lines, ...partialChunks];

    // Truncate if necessary
    let finalCombined = combined;
    if (combined.length > this.maxLines) {
      finalCombined = combined.slice(combined.length - this.maxLines);
    }

    // Add padding to ensure exactly maxLines are displayed
    const linesToPad = this.maxLines - finalCombined.length;
    for (let i = 0; i < linesToPad; i++) {
      finalCombined.push(""); // Add empty lines at the end
    }

    return finalCombined.join("\n");
  }

  private appendToLines(chunk: string): void {
    if (this.lines.length === 0) {
      this.lines.push(chunk);
    } else {
      const lastLine = this.lines.pop() as string;
      const candidate = lastLine === "" ? chunk : lastLine + " " + chunk;

      if (candidate.length <= this.maxCharsPerLine) {
        this.lines.push(candidate);
      } else {
        // Put back the last line if it doesn't fit
        this.lines.push(lastLine);
        this.lines.push(chunk);
      }
    }

    // Ensure we don't exceed maxLines
    while (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
  }

  /**
   * Wrap text into lines based on max line length
   * Replaces double line breaks with indentation instead of blank lines
   */
  public wrapText(text: string, maxLineLength: number): string[] {
    if (typeof maxLineLength !== "number" || isNaN(maxLineLength)) {
      throw new Error(`wrapText: maxLineLength must be a number, got ${typeof maxLineLength}: ${maxLineLength}`);
    }

    const result: string[] = [];

    // Replace double line breaks with a special marker for indentation
    // This handles both \n\n and \r\n\r\n patterns
    const processedText = text.replace(/(\r?\n){2,}/g, '<<<INDENT_MARKER>>>');

    // Split the text by single newlines first
    const lines = processedText.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.length > 0) {
        // Check if this line contains our indent marker
        if (line.includes('<<<INDENT_MARKER>>>')) {
          // Split the line by the marker and process each part
          const parts = line.split('<<<INDENT_MARKER>>>');

          for (let j = 0; j < parts.length; j++) {
            const part = parts[j].trim();

            if (part.length > 0) {
              // Process the text part normally
              this.wrapTextPart(part, maxLineLength, result, j > 0);
            }

            // Add indentation after each part except the last one
            if (j < parts.length - 1) {
              // Add indented continuation (4 spaces of indentation)
              const indentPrefix = "    ";

              // If we just added a line, make the next line indented
              if (result.length > 0) {
                // Mark that the next line should be indented by adding a flag
                // We'll handle this in the next part processing
              }
            }
          }
        } else {
          // Normal line processing
          this.wrapTextPart(line, maxLineLength, result, false);
        }
      } else {
        // Preserve empty lines that aren't part of double breaks
        result.push("");
      }
    }

    return result;
  }

  /**
   * Helper method to wrap a single part of text, with optional indentation
   */
  private wrapTextPart(text: string, maxLineLength: number, result: string[], shouldIndent: boolean): void {
    const indentPrefix = shouldIndent ? "    " : ""; // 4 spaces for indentation
    const effectiveLineLength = maxLineLength - indentPrefix.length;

    let remainingText = text;
    let isFirstLineOfPart = true;

    while (remainingText.length > 0) {
      if (remainingText.length <= effectiveLineLength) {
        const finalLine = (shouldIndent && isFirstLineOfPart) ? indentPrefix + remainingText : remainingText;
        result.push(finalLine);
        break;
      } else {
        let splitIndex = effectiveLineLength;
        while (splitIndex > 0 && remainingText.charAt(splitIndex) !== " ") {
          splitIndex--;
        }
        if (splitIndex === 0) {
          splitIndex = effectiveLineLength;
        }

        const chunk = remainingText.substring(0, splitIndex).trim();
        const finalChunk = (shouldIndent && isFirstLineOfPart) ? indentPrefix + chunk : chunk;
        result.push(finalChunk);
        remainingText = remainingText.substring(splitIndex).trim();
        isFirstLineOfPart = false;
      }
    }
  }

  public getTranscript(): string {
    // Create a copy of the lines for manipulation
    const allLines = [...this.lines];

    // Add padding to ensure exactly maxLines are displayed
    const linesToPad = this.maxLines - allLines.length;
    for (let i = 0; i < linesToPad; i++) {
      allLines.push(""); // Add empty lines at the end
    }

    const finalString = allLines.join("\n");

    // Clear the lines
    this.lines = [];
    return finalString;
  }

  public getLastUserTranscript(): string {
    return this.lastUserTranscript;
  }

  public clear(): void {
    this.lines = [];
    this.partialText = "";
    this.finalTranscriptHistory = [];
  }

  public getMaxCharsPerLine(): number {
    return this.maxCharsPerLine;
  }

  public getMaxLines(): number {
    return this.maxLines;
  }

  // Helper method to split a full text into segments for teleprompter
  public splitTextIntoSegments(fullText: string, segmentLines: number = 10): string[] {
    // First wrap the text into lines
    const allLines = this.wrapText(fullText, this.maxCharsPerLine);

    // Group lines into segments
    const segments: string[] = [];
    for (let i = 0; i < allLines.length; i += segmentLines) {
      const segmentLines = allLines.slice(i, i + this.maxLines);
      segments.push(segmentLines.join('\n'));
    }

    return segments;
  }

  // Count words in a text
  public countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  // Estimate average words per line
  public estimateWordsPerLine(text: string): number {
    const lines = this.wrapText(text, this.maxCharsPerLine);
    if (lines.length === 0) return 0;

    let totalWords = 0;
    for (const line of lines) {
      totalWords += this.countWords(line);
    }

    return totalWords / lines.length;
  }
}
